import json
import logging

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.model_config import ModelConfig

logger = logging.getLogger(__name__)


# 任务类型到配置ID的映射
TASK_CONFIG_MAP = {
    "需求解析": "parse-requirements",
    "测试点生成": "generate-test-points",
    "用例生成": "generate-test-cases",
    "用例评审": "review-test-cases",
}


async def _get_config_for_task(task_type: str) -> dict:
    """根据任务类型从数据库获取配置"""
    config_id = TASK_CONFIG_MAP.get(task_type)

    async with async_session() as db:
        if config_id:
            result = await db.execute(select(ModelConfig).where(ModelConfig.id == config_id))
            config = result.scalar_one_or_none()
            if config and config.enabled and config.api_key:
                return {
                    "api_key": config.api_key,
                    "endpoint": config.endpoint,
                    "model": config.model_name,
                }

        # 尝试获取任意一个启用的配置
        result = await db.execute(
            select(ModelConfig).where(ModelConfig.enabled == True, ModelConfig.api_key != "")
        )
        configs = result.scalars().all()
        if configs:
            config = configs[0]
            return {
                "api_key": config.api_key,
                "endpoint": config.endpoint,
                "model": config.model_name,
            }

    # 使用默认配置
    return {
        "api_key": settings.LLM_API_KEY,
        "endpoint": settings.LLM_BASE_URL,
        "model": settings.LLM_MODEL,
    }


class AIService:
    async def _call_llm(self, system_prompt: str, user_prompt: str, task_type: str = "") -> str:
        """Call LLM API and return the response content."""
        config = await _get_config_for_task(task_type)

        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": config['model'],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 4000,
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                config['endpoint'],
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    def _parse_json_response(self, text: str) -> list | dict:
        """Extract JSON from LLM response."""
        # Try to find JSON in the response
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```") and not in_block:
                    in_block = True
                    continue
                elif line.startswith("```") and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            text = "\n".join(json_lines)

        return json.loads(text)

    async def parse_requirements(self, file_content: str) -> list[dict]:
        """Parse requirement document and extract structured requirements."""
        system_prompt = """你是一个专业的软件测试需求分析专家。你的任务是从需求文档中提取结构化的需求信息。

请以 JSON 数组格式输出，每个元素包含以下字段：
- module: 所属模块名称
- feature: 功能点名称
- source: 来源（文档章节）
- risk: 风险等级（高/中/低）
- rule: 业务规则描述
- question: 待确认的问题（如果有的话）

只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请分析以下需求文档内容，提取结构化需求：\n\n{file_content[:3000]}"

        response = await self._call_llm(system_prompt, user_prompt, "需求解析")
        return self._parse_json_response(response)

    async def generate_test_points(self, requirements_text: str) -> list[dict]:
        """Generate test points from requirements."""
        system_prompt = """你是一个专业的软件测试设计专家。你的任务是根据需求生成测试点。

请以 JSON 数组格式输出，每个元素包含以下字段：
- module: 所属模块
- type: 测试类型（正常流程/异常流程/边界值/权限控制/数据一致性/状态流转）
- title: 测试点标题（简洁描述要验证的内容）
- description: 详细描述
- priority: 优先级（P0/P1/P2/P3）
- automatable: 是否可自动化（true/false）

确保覆盖正常流程、异常流程、边界值、权限控制等场景。
只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请根据以下需求生成测试点：\n\n{requirements_text[:3000]}"

        response = await self._call_llm(system_prompt, user_prompt, "测试点生成")
        return self._parse_json_response(response)

    async def generate_test_cases(self, test_points_text: str) -> list[dict]:
        """Generate test cases from test points."""
        system_prompt = """你是一个专业的软件测试用例编写专家。你的任务是根据测试点生成详细的测试用例。

请以 JSON 数组格式输出，每个元素包含以下字段：
- caseCode: 用例编号（格式：TC_模块缩写_序号，如 TC_LOGIN_001）
- module: 所属模块
- feature: 功能点
- title: 用例标题
- priority: 优先级（P0/P1/P2/P3）
- precondition: 前置条件
- steps: 测试步骤（用换行分隔，每步一行）
- testData: 测试数据
- expectedResult: 预期结果
- automation: 自动化标识（适合/不适合/待评估）

确保步骤清晰可执行，预期结果明确可判断。
只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请根据以下测试点生成测试用例：\n\n{test_points_text[:3000]}"

        response = await self._call_llm(system_prompt, user_prompt, "用例生成")
        return self._parse_json_response(response)
