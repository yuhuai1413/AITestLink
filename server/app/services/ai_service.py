import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.model_config import ModelConfig
from app.schemas.ai_output import output_json_schema, validate_ai_object, validate_ai_output
from app.services.llm_client import OpenAICompatibleClient, json_schema_response_format, supports_json_schema
from app.services.prompt_service import get_published_prompt
from app.utils import decrypt_value, ensure_chat_endpoint

logger = logging.getLogger(__name__)


# 任务类型到配置key的映射
TASK_CONFIG_MAP = {
    "需求解析": "parse-requirements",
    "AI反推需求": "reverse-requirements",
    "系统识别": "system-recognition",
    "测试点生成": "generate-test-points",
    "用例生成": "generate-test-cases",
    "脚本生成": "generate-scripts",
    "执行脚本": "execute-scripts",
    "文档生成": "generate-docs",
}


async def _get_admin_prompt(db, config_key: str | None) -> str:
    """兼容入口：实际读取集中式已发布版本。"""
    return await get_published_prompt(db, config_key)


async def _get_config_for_task(task_type: str, user_id: str) -> dict:
    """根据任务类型和用户ID从数据库获取配置"""
    config_key = TASK_CONFIG_MAP.get(task_type)

    async with async_session() as db:
        admin_prompt = await _get_admin_prompt(db, config_key)
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
                        "prompt": admin_prompt,
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
                "prompt": admin_prompt,
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
                connection_status = config.connection_status or "untested"
                if is_configured and connection_status == "abnormal":
                    return {
                        "configured": False,
                        "configId": config.id,
                        "name": config.name,
                        "connectionStatus": connection_status,
                        "lastTestedAt": _utc_iso(config.last_tested_at),
                        "lastTestMessage": config.last_test_message or "",
                        "message": f"「{config.name}」连接状态异常，请在模型配置页面修复或重新测试",
                    }
                return {
                    "configured": is_configured,
                    "configId": config.id,
                    "name": config.name,
                    "connectionStatus": connection_status,
                    "lastTestedAt": _utc_iso(config.last_tested_at),
                    "lastTestMessage": config.last_test_message or "",
                    "message": "已配置" if is_configured else f"请先在模型配置页面设置「{config.name}」的模型数据",
                }

    return {"configured": False, "name": task_type, "message": "配置不存在"}


def _utc_iso(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _is_config_level_failure(exc: Exception) -> bool:
    """Only persistent configuration failures should poison node status.

    A long generation can fail because of timeout, transient network jitter, or
    output validation. Those should make the task fail, but should not mark the
    model connection as globally abnormal and block the next attempt.
    """
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None) if response is not None else None
    if status_code in {401, 403, 404}:
        return True
    message = str(exc)
    config_markers = (
        "401", "Unauthorized", "403", "Forbidden", "404", "Not Found",
        "invalid api key", "incorrect api key", "API Key",
    )
    return any(marker in message for marker in config_markers)


async def _mark_config_status(task_type: str, user_id: str, status: str, message: str = "") -> None:
    config_key = TASK_CONFIG_MAP.get(task_type)
    if not config_key or not user_id:
        return
    async with async_session() as db:
        result = await db.execute(
            select(ModelConfig).where(
                ModelConfig.config_key == config_key,
                ModelConfig.user_id == user_id,
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            return
        config.connection_status = status
        config.last_tested_at = datetime.now(timezone.utc)
        config.last_test_message = message[:1000] if message else ""
        await db.commit()


class AIService:
    def __init__(self, llm_client: OpenAICompatibleClient | None = None):
        self.llm_client = llm_client or OpenAICompatibleClient()

    async def _call_llm(self, user_prompt: str, task_type: str = "", user_id: str = "", max_tokens: int = 16000, system_prompt_override: str = "") -> str:
        """Call LLM API and return the response content.

        system_prompt 从管理员维护的节点提示词读取，普通用户配置只提供模型连接信息。
        system_prompt_override 仅在模板生成等特殊场景下使用，会跳过数据库读取。
        """
        config = await _get_config_for_task(task_type, user_id)

        final_system_prompt = system_prompt_override or config.get("prompt", "")
        if not final_system_prompt:
            raise ValueError(f"「{task_type}」的管理员提示词未发布，请联系管理员配置")

        try:
            content = await self.llm_client.complete(
                endpoint=config["endpoint"],
                api_key=config["api_key"],
                model=config["model"],
                system_prompt=final_system_prompt,
                user_prompt=user_prompt,
                task_type=task_type,
                max_tokens=max_tokens,
                response_schema=output_json_schema(task_type),
            )
            await _mark_config_status(task_type, user_id, "normal", "最近一次任务调用成功")
            return content
        except Exception as exc:
            if _is_config_level_failure(exc):
                await _mark_config_status(task_type, user_id, "abnormal", str(exc))
            raise

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
            result = json.loads(text)
            logger.info(f"_parse_json_response: direct parse succeeded, type={type(result).__name__}")
            return result
        except (json.JSONDecodeError, ValueError):
            pass

        # 2. Extract from markdown code blocks (```json ... ``` or ``` ... ```)
        code_block_pattern = re.compile(r'```(?:json)?\s*\n?(.*?)```', re.DOTALL)
        matches = code_block_pattern.findall(text)
        logger.info(f"_parse_json_response: found {len(matches)} code blocks, total text len={len(text)}")
        for idx, match in enumerate(matches):
            stripped = match.strip()
            logger.info(f"_parse_json_response: code block {idx}: len={len(stripped)}, first30={stripped[:30]!r}, last30={stripped[-30:]!r}")
            try:
                result = json.loads(stripped)
                if isinstance(result, list):
                    logger.info(f"_parse_json_response: code block parsed as list, len={len(result)}")
                elif isinstance(result, dict):
                    logger.info(f"_parse_json_response: code block parsed as dict, keys={list(result.keys())[:5]}")
                return result
            except (json.JSONDecodeError, ValueError) as e:
                logger.info(f"_parse_json_response: code block parse failed: {e}")
                continue

        # 3. Find the outermost JSON array using bracket matching
        # 优先查找数组，因为 LLM 通常返回数组格式
        logger.info(f"_parse_json_response: trying bracket matching, text starts with: {text[:20]!r}")

        # 先尝试匹配完整的数组
        start_idx = text.find('[')
        if start_idx >= 0:
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == '[':
                    depth += 1
                elif text[i] == ']':
                    depth -= 1
                    if depth == 0:
                        candidate = text[start_idx:i + 1]
                        try:
                            result = json.loads(candidate)
                            if isinstance(result, list):
                                logger.info(f"_parse_json_response: bracket match found array, len={len(result)}")
                                return result
                        except (json.JSONDecodeError, ValueError):
                            break

            # 数组没有闭合，尝试修复（截断的 JSON）
            logger.info(f"_parse_json_response: array not closed, trying to repair truncated JSON")
            # 找到最后一个完整的对象结束位置
            last_brace = text.rfind('}')
            if last_brace > start_idx:
                repaired = text[start_idx:last_brace + 1] + ']'
                try:
                    result = json.loads(repaired)
                    if isinstance(result, list):
                        logger.info(f"_parse_json_response: repaired truncated array, len={len(result)}")
                        return result
                except (json.JSONDecodeError, ValueError):
                    pass

        # 如果数组匹配失败，尝试匹配对象
        start_idx = text.find('{')
        if start_idx >= 0:
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        candidate = text[start_idx:i + 1]
                        try:
                            result = json.loads(candidate)
                            logger.info(f"_parse_json_response: bracket match found object")
                            return result
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
        return validate_ai_output("需求解析", self._parse_json_response(response))

    async def reverse_requirements(self, context_text: str, user_id: str = "") -> list[dict]:
        """Infer candidate requirements from recognized UI and environment context."""
        user_prompt = f"""请基于以下系统识别结果和反推约束，反推出可进入需求列表的候选需求。

要求：
1. 只基于输入中的环境、账号角色、页面、菜单、按钮、表单字段、URL 和识别证据反推，禁止编造看不到的业务规则。
2. 需求粒度控制在“可测试的功能点”，不要把每个按钮机械拆成一条需求。
3. 不确定的业务规则、权限边界、状态流转、数据范围必须写入 question。
4. source 统一填写“系统识别反推”。
5. 输出字段必须严格为 module、feature、source、risk、rule、question。

反推上下文：
{context_text}"""

        response = await self._call_llm(user_prompt, "AI反推需求", user_id)
        return validate_ai_output("AI反推需求", self._parse_json_response(response))

    async def generate_test_points(self, requirements_text: str, user_id: str = "") -> list[dict]:
        """Generate test points from requirements."""
        user_prompt = f"以下是本批需求 JSON。只处理这些需求，并保持 requirementId 原值不变：\n{requirements_text}"

        response = await self._call_llm(user_prompt, "测试点生成", user_id)
        parsed = self._parse_json_response(response)
        try:
            return validate_ai_output("测试点生成", parsed)
        except ValueError:
            logger.error(
                "generate_test_points validation failed. input_preview=%s output_preview=%s",
                requirements_text[:1000],
                json.dumps(parsed, ensure_ascii=False)[:2000] if isinstance(parsed, (dict, list)) else str(parsed)[:2000],
            )
            raise

    async def generate_test_cases(self, test_points_text: str, user_id: str = "") -> list[dict]:
        """Generate test cases from test points."""
        user_prompt = (
            "以下是本批测试点 JSON。每个测试点至少生成一条用例，保持 testPointId 原值不变：\n"
            f"{test_points_text}"
        )

        response = await self._call_llm(user_prompt, "用例生成", user_id, max_tokens=16000)
        return validate_ai_output("用例生成", self._parse_json_response(response))

    async def generate_automation_scripts(self, test_cases_text: str, user_id: str = "") -> list[dict]:
        """Generate Playwright automation scripts from test cases using AI."""
        user_prompt = f"以下是本批可自动化测试用例 JSON。每条用例生成一个脚本，保持 testCaseId 原值不变：\n{test_cases_text}"

        response = await self._call_llm(user_prompt, "脚本生成", user_id)
        return validate_ai_output("脚本生成", self._parse_json_response(response))

    async def analyze_system_recognition(self, recognition_input: dict, user_id: str = "") -> dict:
        """Use AI to turn real DOM snapshots plus requirement scope into page objects."""
        user_prompt = (
            "请基于以下真实系统 DOM 摘要和需求范围进行系统识别。"
            "只输出结构化 JSON，不要解释。\n\n"
            f"{json.dumps(recognition_input, ensure_ascii=False)}"
        )

        response = await self._call_llm(user_prompt, "系统识别", user_id, max_tokens=16000)
        return validate_ai_object("系统识别", self._parse_json_response(response))

    async def analyze_script_execution(self, scripts_text: str, execution_results: str, user_id: str = "") -> dict:
        """AI analysis of script execution results and generate report."""
        user_prompt = f"请只依据以下脚本元数据和 Worker 执行结果进行分析，不要模拟执行。\n\n脚本信息：\n{scripts_text}\n\n执行结果：\n{execution_results}"

        response = await self._call_llm(user_prompt, "执行脚本", user_id)
        return validate_ai_object("执行脚本", self._parse_json_response(response))

    async def generate_test_documents(self, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict:
        """AI generate test documentation (test plan, test report, etc.)."""
        user_prompt = f"请根据以下真实项目数据生成测试文档；缺失信息标记为待补充。\n\n项目信息：\n{project_info}\n\n需求列表：\n{requirements_text}\n\n测试点列表：\n{test_points_text}\n\n测试用例列表：\n{test_cases_text}"

        response = await self._call_llm(user_prompt, "文档生成", user_id)
        return validate_ai_object("文档生成", self._parse_json_response(response))

    async def generate_doc_by_template(self, template_prompt: str, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict:
        """使用模板专属 prompt 生成文档"""
        user_prompt = (
            f"请根据以下项目信息生成文档。\n\n"
            f"模板要求：\n{template_prompt}\n\n"
            f"项目信息：\n{project_info}\n\n"
            f"需求列表：\n{requirements_text}\n\n"
            f"测试点列表：\n{test_points_text}\n\n"
            f"测试用例列表：\n{test_cases_text}\n\n"
            f"输出格式要求：以 JSON 格式输出，包含 documentType、title、content（Markdown 格式）、metadata 字段。"
        )

        response = await self._call_llm(user_prompt, "文档生成", user_id)
        return validate_ai_object("文档生成", self._parse_json_response(response))

    # ── 流式调用 ────────────────────────────────────────────────────

    async def _call_llm_stream(self, user_prompt: str, task_type: str = "", user_id: str = "", max_tokens: int = 16000, system_prompt_override: str = "") -> AsyncGenerator[str, None]:
        """流式调用 LLM，逐 chunk yield 文本片段。"""
        config = await _get_config_for_task(task_type, user_id)
        final_system_prompt = system_prompt_override or config.get("prompt", "")
        if not final_system_prompt:
            raise ValueError(f"「{task_type}」的管理员提示词未发布，请联系管理员配置")

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
        structured_format = None
        if supports_json_schema(config["endpoint"]):
            structured_format = json_schema_response_format(task_type, output_json_schema(task_type))
            if structured_format:
                payload["response_format"] = structured_format

        async with httpx.AsyncClient(timeout=600) as client:
            try:
                for attempt in range(2):
                    async with client.stream(
                        "POST",
                        ensure_chat_endpoint(config['endpoint']),
                        headers=headers,
                        json=payload,
                    ) as response:
                        logger.info(f"_call_llm_stream: task={task_type}, status={response.status_code}")
                        if structured_format and attempt == 0 and response.status_code in {400, 404, 422}:
                            await response.aread()
                            payload.pop("response_format", None)
                            logger.warning("流式 JSON Schema 不受供应商支持，自动降级重试：task=%s", task_type)
                            continue
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
                        await _mark_config_status(task_type, user_id, "normal", "最近一次任务调用成功")
                        return
            except Exception as exc:
                await _mark_config_status(task_type, user_id, "abnormal", str(exc))
                raise

    async def generate_stream(self, user_prompt: str, task_type: str, user_id: str = "", batch_size: int = 5, max_tokens: int = 16000, system_prompt_override: str = "") -> AsyncGenerator[list[dict], None]:
        """流式接收 LLM 响应，接收完后解析 JSON 分批 yield。"""
        logger.info(f"generate_stream: starting LLM stream for task={task_type}")

        # 阶段1：流式接收
        full_text = ""
        chunk_count = 0
        async for chunk in self._call_llm_stream(user_prompt, task_type, user_id, max_tokens=max_tokens, system_prompt_override=system_prompt_override):
            full_text += chunk
            chunk_count += 1
            # 每 10 个 chunk 发一次"接收中"进度
            if chunk_count % 10 == 0:
                yield []  # 空 batch = 进度标记

        logger.info(f"generate_stream: received full response, length={len(full_text)}, chunks={chunk_count}")

        # 阶段2：解析 JSON
        items = validate_ai_output(task_type, self._parse_json_response(full_text))

        logger.info(f"generate_stream: parsed {len(items)} items from response")

        # 阶段3：分批 yield
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            yield batch
