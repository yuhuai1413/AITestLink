import json
import logging
from typing import AsyncGenerator

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.model_config import ModelConfig
from app.utils import decrypt_value, ensure_chat_endpoint

logger = logging.getLogger(__name__)


# 任务类型到配置key的映射
TASK_CONFIG_MAP = {
    "需求解析": "parse-requirements",
    "测试点生成": "generate-test-points",
    "用例生成": "generate-test-cases",
    "脚本生成": "generate-scripts",
    "执行脚本": "execute-scripts",
    "文档生成": "generate-docs",
}


async def _get_config_for_task(task_type: str, user_id: str) -> dict:
    """根据任务类型和用户ID从数据库获取配置"""
    config_key = TASK_CONFIG_MAP.get(task_type)

    async with async_session() as db:
        if config_key:
            result = await db.execute(
                select(ModelConfig).where(
                    ModelConfig.config_key == config_key,
                    ModelConfig.user_id == user_id
                )
            )
            config = result.scalar_one_or_none()
            if config:
                if not config.enabled:
                    raise ValueError(f"「{config.name}」已禁用，请在模型配置页面启用后重试")
                if config.api_key and config.endpoint and config.model_name:
                    return {
                        "api_key": decrypt_value(config.api_key),
                        "endpoint": config.endpoint,
                        "model": config.model_name,
                        "prompt": config.prompt or "",
                    }
                # 配置存在但字段不完整
                raise ValueError(f"「{config.name}」配置不完整，请在模型配置页面补全供应商、模型、API Key 和 Endpoint")

        # 尝试获取该用户任意一个启用且字段完整的配置（仅当该任务类型未配置时）
        result = await db.execute(
            select(ModelConfig).where(
                ModelConfig.user_id == user_id,
                ModelConfig.enabled.is_(True),
                ModelConfig.api_key != "",
                ModelConfig.endpoint != "",
                ModelConfig.model_name != "",
            )
        )
        configs = result.scalars().all()
        if configs:
            config = configs[0]
            return {
                "api_key": decrypt_value(config.api_key),
                "endpoint": config.endpoint,
                "model": config.model_name,
                "prompt": config.prompt or "",
            }

    raise ValueError(f"未找到可用的模型配置，请在模型配置页面配置并启用至少一个模型")


async def check_config_for_task(task_type: str, user_id: str) -> dict:
    """检查用户是否已配置指定任务的模型"""
    config_key = TASK_CONFIG_MAP.get(task_type)

    async with async_session() as db:
        if config_key:
            result = await db.execute(
                select(ModelConfig).where(
                    ModelConfig.config_key == config_key,
                    ModelConfig.user_id == user_id
                )
            )
            config = result.scalar_one_or_none()
            if config:
                if not config.enabled:
                    return {
                        "configured": False,
                        "configId": config.id,
                        "name": config.name,
                        "message": f"「{config.name}」已禁用，请在模型配置页面启用后重试",
                    }
                is_configured = bool(config.provider and config.model_name and config.api_key and config.endpoint)
                return {
                    "configured": is_configured,
                    "configId": config.id,
                    "name": config.name,
                    "message": "已配置" if is_configured else f"请先在模型配置页面设置「{config.name}」的模型数据",
                }

    return {"configured": False, "name": task_type, "message": "配置不存在"}


class AIService:
    async def _call_llm(self, user_prompt: str, task_type: str = "", user_id: str = "", max_tokens: int = 16000, system_prompt_override: str = "") -> str:
        """Call LLM API and return the response content.

        system_prompt 从数据库读取（用户在模型配置页面设置）。
        system_prompt_override 仅在模板生成等特殊场景下使用，会跳过数据库读取。
        """
        config = await _get_config_for_task(task_type, user_id)

        final_system_prompt = system_prompt_override or config.get("prompt", "")
        if not final_system_prompt:
            raise ValueError(f"「{task_type}」的提示词未配置，请在模型配置页面设置提示词")

        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config['model'],
            "messages": [
                {"role": "system", "content": final_system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=600) as client:
            response = await client.post(
                ensure_chat_endpoint(config['endpoint']),
                headers=headers,
                json=payload,
            )
            logger.info(f"_call_llm: task={task_type}, status={response.status_code}")
            if response.status_code != 200:
                logger.error(f"_call_llm failed: task={task_type}, status={response.status_code}, body={response.text[:500]}")
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"].get("content")
            if not content:
                msg = data["choices"][0]["message"]
                logger.warning(f"LLM returned empty content for task: {task_type}, message keys: {list(msg.keys())}, full message: {str(msg)[:500]}")
                content = msg.get("reasoning_content") or ""
            logger.info(f"_call_llm: task={task_type}, content_len={len(content) if content else 0}, preview={str(content)[:100] if content else 'None'}")
            return content

    def _parse_json_response(self, text: str) -> list | dict:
        """Extract JSON from LLM response, handling various output formats."""
        import re
        if not text:
            logger.error(f"LLM returned None/empty response, type={type(text).__name__}")
            return []
        text = text.strip()
        if not text:
            logger.error("LLM returned empty response")
            return []

        # 1. Try direct parse first
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass

        # 2. Extract from markdown code blocks (```json ... ``` or ``` ... ```)
        code_block_pattern = re.compile(r'```(?:json)?\s*\n?(.*?)```', re.DOTALL)
        matches = code_block_pattern.findall(text)
        for match in matches:
            try:
                return json.loads(match.strip())
            except (json.JSONDecodeError, ValueError):
                continue

        # 3. Find the outermost JSON array or object using bracket matching
        for start_char, end_char in [('[', ']'), ('{', '}')]:
            start_idx = text.find(start_char)
            if start_idx == -1:
                continue
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == start_char:
                    depth += 1
                elif text[i] == end_char:
                    depth -= 1
                    if depth == 0:
                        candidate = text[start_idx:i + 1]
                        try:
                            return json.loads(candidate)
                        except (json.JSONDecodeError, ValueError):
                            break

        # 4. Try repairing truncated JSON (last resort)
        if text.startswith("["):
            try:
                last_brace = text.rfind("}")
                if last_brace > 0:
                    repaired = text[:last_brace + 1] + "]"
                    result = json.loads(repaired)
                    if isinstance(result, list):
                        logger.warning(f"Recovered {len(result)} items from truncated JSON")
                        return result
            except json.JSONDecodeError:
                pass

        logger.error(f"Failed to parse LLM response as JSON. Preview: {text[:500]}")
        return []

    async def parse_requirements(self, file_content: str, user_id: str = "") -> list[dict]:
        """Parse requirement document and extract structured requirements."""
        CHUNK_SIZE = 50000
        content = file_content.strip()
        if len(content) <= CHUNK_SIZE:
            doc_text = content + "\n\n【文档结束】"
        else:
            parts = []
            for idx, i in enumerate(range(0, len(content), CHUNK_SIZE), 1):
                if idx > 1:
                    parts.append(f"\n\n---第{idx}段---\n\n")
                parts.append(content[i:i + CHUNK_SIZE])
            doc_text = "".join(parts) + "\n\n【文档结束】"

        user_prompt = f"请对以下文档内容进行专业的需求分析。\n\n注意区分需求文档和辅助文档，辅助文档中的关键测试数据（如账号、密码、部门信息等）请在「question」字段中标注，格式为：【辅助文档信息】xxx。\n\n文档内容：\n\n{doc_text}"

        response = await self._call_llm(user_prompt, "需求解析", user_id)
        return self._parse_json_response(response)

    async def generate_test_points(self, requirements_text: str, user_id: str = "") -> list[dict]:
        """Generate test points from requirements."""
        user_prompt = f"请以资深测试架构师的视角，根据以下需求生成全面的测试点。要求覆盖正常流程、异常流程、边界值、权限控制、数据一致性、状态流转等维度，并给出合理的优先级和自动化评估。\n\n需求列表：\n\n{requirements_text[:3000]}"

        response = await self._call_llm(user_prompt, "测试点生成", user_id)
        return self._parse_json_response(response)

    async def generate_test_cases(self, test_points_text: str, user_id: str = "") -> list[dict]:
        """Generate test cases from test points."""
        user_prompt = (
            "请以资深测试工程师的视角，根据以下测试点生成可执行的测试用例。要求："
            "1. 步骤使用 步骤N: 格式，每步包含验证点（用 查看...是否... 句式） "
            "2. 预期结果包含步骤编号和 应 字 "
            "3. 数据具体化，不使用模糊描述 "
            "4. 编号格式 TC_XXX_NNN "
            "5. 用例标题只写验证目标本身，严禁在标题开头加 [xxx] 前缀（如 [正常流程]、[异常流程]、[边界值] 等），这些类型信息由 testType 字段单独存储"
            f"\n\n测试点列表：\n\n{test_points_text[:3000]}"
        )

        response = await self._call_llm(user_prompt, "用例生成", user_id, max_tokens=16000)
        return self._parse_json_response(response)

    async def generate_automation_scripts(self, test_cases_text: str, user_id: str = "") -> list[dict]:
        """Generate Playwright automation scripts from test cases using AI."""
        user_prompt = f"请根据以下测试用例生成可直接运行的 Playwright 自动化测试脚本。要求代码完整、断言具体、结构清晰，遵循 Page Object Model 模式。\n\n测试用例列表：\n\n{test_cases_text[:4000]}"

        response = await self._call_llm(user_prompt, "脚本生成", user_id)
        return self._parse_json_response(response)

    async def analyze_script_execution(self, scripts_text: str, execution_results: str, user_id: str = "") -> dict:
        """AI analysis of script execution results and generate report."""
        user_prompt = f"请分析以下自动化脚本的执行结果，生成详细的执行报告和缺陷报告。\n\n脚本信息：\n{scripts_text[:2000]}\n\n执行结果：\n{execution_results[:2000]}"

        response = await self._call_llm(user_prompt, "执行脚本", user_id)
        return self._parse_json_response(response)

    async def generate_test_documents(self, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict:
        """AI generate test documentation (test plan, test report, etc.)."""
        user_prompt = f"请根据以下项目信息生成测试文档。\n\n项目信息：\n{project_info[:1000]}\n\n需求列表：\n{requirements_text[:1500]}\n\n测试点列表：\n{test_points_text[:1500]}\n\n测试用例列表：\n{test_cases_text[:1500]}"

        response = await self._call_llm(user_prompt, "文档生成", user_id)
        return self._parse_json_response(response)

    async def generate_doc_by_template(self, template_prompt: str, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict:
        """使用模板专属 prompt 生成文档"""
        user_prompt = (
            f"请根据以下项目信息生成文档。\n\n"
            f"项目信息：\n{project_info[:1000]}\n\n"
            f"需求列表：\n{requirements_text[:1500]}\n\n"
            f"测试点列表：\n{test_points_text[:1500]}\n\n"
            f"测试用例列表：\n{test_cases_text[:1500]}\n\n"
            f"输出格式要求：以 JSON 格式输出，包含 documentType、title、content（Markdown 格式）、metadata 字段。"
        )

        response = await self._call_llm(user_prompt, "文档生成", user_id, system_prompt_override=template_prompt)
        return self._parse_json_response(response)

    # ── 流式调用 ────────────────────────────────────────────────────

    async def _call_llm_stream(self, user_prompt: str, task_type: str = "", user_id: str = "", max_tokens: int = 16000, system_prompt_override: str = "") -> AsyncGenerator[str, None]:
        """流式调用 LLM，逐 chunk yield 文本片段。"""
        config = await _get_config_for_task(task_type, user_id)
        final_system_prompt = system_prompt_override or config.get("prompt", "")
        if not final_system_prompt:
            raise ValueError(f"「{task_type}」的提示词未配置，请在模型配置页面设置提示词")

        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config['model'],
            "messages": [
                {"role": "system", "content": final_system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                ensure_chat_endpoint(config['endpoint']),
                headers=headers,
                json=payload,
            ) as response:
                logger.info(f"_call_llm_stream: task={task_type}, status={response.status_code}")
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error(f"_call_llm_stream failed: task={task_type}, status={response.status_code}, body={body[:500]}")
                    response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        choices = chunk.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield content
                    except json.JSONDecodeError:
                        continue

    async def generate_stream(self, user_prompt: str, task_type: str, user_id: str = "", batch_size: int = 5, max_tokens: int = 16000, system_prompt_override: str = "") -> AsyncGenerator[list[dict], None]:
        """流式接收 LLM 响应，接收过程中发进度，攒完后解析 JSON 分批 yield。

        LLM 流式返回逐字文本，不能边收边解析 JSON。
        所以分两阶段：接收阶段发 "接收中" 进度 → 收完后解析分批 yield。
        """
        logger.info(f"generate_stream: starting LLM stream for task={task_type}")

        # 阶段1：流式接收，每收到一段文本就 yield 一个进度标记
        full_text = ""
        chunk_count = 0
        async for chunk in self._call_llm_stream(user_prompt, task_type, user_id, max_tokens=max_tokens, system_prompt_override=system_prompt_override):
            full_text += chunk
            chunk_count += 1
            # 每 10 个 chunk 发一次"接收中"进度（不写库，只通知前端）
            if chunk_count % 10 == 0:
                yield []  # 空 batch = 进度标记

        logger.info(f"generate_stream: received full response, length={len(full_text)}, chunks={chunk_count}")

        # 阶段2：解析 JSON
        items = self._parse_json_response(full_text)
        if not isinstance(items, list):
            items = [items] if isinstance(items, dict) else []

        logger.info(f"generate_stream: parsed {len(items)} items from response")

        # 阶段3：分批 yield（带数据的 batch）
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            yield batch
