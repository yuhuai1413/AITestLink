"""OpenAI-compatible LLM transport.

This module owns HTTP concerns only. Business services provide the selected
model configuration and prompts, which keeps networking independent from AI
task orchestration and persistence.
"""

import logging

import httpx

from app.utils import ensure_chat_endpoint

logger = logging.getLogger(__name__)


def supports_json_schema(endpoint: str) -> bool:
    normalized = endpoint.lower()
    return "api.openai.com" in normalized or "openai.azure.com" in normalized


def json_schema_response_format(task_type: str, schema: dict | None) -> dict | None:
    if not schema:
        return None
    safe_name = {
        "需求解析": "requirements",
        "系统识别": "system_recognition",
        "测试点生成": "test_points",
        "用例生成": "test_cases",
        "脚本生成": "automation_scripts",
        "执行脚本": "execution_report",
        "文档生成": "test_document",
    }.get(task_type, "structured_output")
    return {
        "type": "json_schema",
        "json_schema": {"name": safe_name, "strict": True, "schema": schema},
    }


class OpenAICompatibleClient:
    def __init__(self, timeout_seconds: float = 600):
        self.timeout_seconds = timeout_seconds

    async def complete(
        self,
        *,
        endpoint: str,
        api_key: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        task_type: str,
        max_tokens: int,
        response_schema: dict | None = None,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
        structured_format = None
        if supports_json_schema(endpoint):
            structured_format = json_schema_response_format(task_type, response_schema)
            if structured_format:
                payload["response_format"] = structured_format

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                ensure_chat_endpoint(endpoint),
                headers=headers,
                json=payload,
            )
            if structured_format and response.status_code in {400, 404, 422}:
                logger.warning(
                    "Provider rejected JSON Schema output; retrying without response_format: task=%s, status=%s",
                    task_type,
                    response.status_code,
                )
                payload.pop("response_format", None)
                response = await client.post(
                    ensure_chat_endpoint(endpoint),
                    headers=headers,
                    json=payload,
                )
            logger.info("LLM request: task=%s, status=%s", task_type, response.status_code)
            if response.status_code != 200:
                logger.error(
                    "LLM request failed: task=%s, status=%s, body=%s",
                    task_type,
                    response.status_code,
                    response.text[:500],
                )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            content = message.get("content") or message.get("reasoning_content") or ""
            if not content:
                logger.warning("LLM returned empty content: task=%s, keys=%s", task_type, list(message.keys()))
            return content
