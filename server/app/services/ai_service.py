import json
import logging

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.model_config import ModelConfig
from app.utils import decrypt_value

logger = logging.getLogger(__name__)


# 任务类型到配置key的映射
TASK_CONFIG_MAP = {
    "需求解析": "parse-requirements",
    "测试点生成": "generate-test-points",
    "用例生成": "generate-test-cases",
    "用例评审": "review-test-cases",
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
            if config and config.enabled and config.api_key:
                return {
                    "api_key": decrypt_value(config.api_key),
                    "endpoint": config.endpoint,
                    "model": config.model_name,
                }

        # 尝试获取该用户任意一个启用的配置
        result = await db.execute(
            select(ModelConfig).where(
                ModelConfig.user_id == user_id,
                ModelConfig.enabled.is_(True),
                ModelConfig.api_key != ""
            )
        )
        configs = result.scalars().all()
        if configs:
            config = configs[0]
            return {
                "api_key": decrypt_value(config.api_key),
                "endpoint": config.endpoint,
                "model": config.model_name,
            }

    # 使用默认配置
    return {
        "api_key": settings.LLM_API_KEY,
        "endpoint": settings.LLM_BASE_URL,
        "model": settings.LLM_MODEL,
    }


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
                is_configured = bool(config.provider and config.model_name and config.api_key and config.endpoint)
                return {
                    "configured": is_configured,
                    "name": config.name,
                    "message": "已配置" if is_configured else f"请先在模型配置页面设置「{config.name}」的模型数据",
                }

    return {"configured": False, "name": task_type, "message": "配置不存在"}


class AIService:
    async def _call_llm(self, system_prompt: str, user_prompt: str, task_type: str = "", user_id: str = "", max_tokens: int = 16000) -> str:
        """Call LLM API and return the response content."""
        config = await _get_config_for_task(task_type, user_id)

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
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                config['endpoint'],
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not content:
                logger.warning(f"LLM returned empty content for task: {task_type}")
            return content

    def _parse_json_response(self, text: str) -> list | dict:
        """Extract JSON from LLM response."""
        text = text.strip()
        if not text:
            logger.error("LLM returned empty response")
            return []

        # Try to find JSON in the response
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

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Response preview: {text[:500]}")
            # 尝试修复截断的 JSON：逐个去掉末尾不完整的元素
            if text.startswith("["):
                try:
                    # 找到最后一个完整的 JSON 对象
                    last_brace = text.rfind("}")
                    if last_brace > 0:
                        repaired = text[:last_brace + 1] + "]"
                        result = json.loads(repaired)
                        if isinstance(result, list):
                            logger.warning(f"Recovered {len(result)} items from truncated JSON")
                            return result
                except json.JSONDecodeError:
                    pass
            return []

    async def parse_requirements(self, file_content: str, user_id: str = "") -> list[dict]:
        """Parse requirement document and extract structured requirements."""
        system_prompt = """你是一位具有 10 年以上经验的高级软件测试工程师，精通需求分析和测试左移实践。你的任务是对提交的文档进行专业的需求分析。

## 文档分类与处理规则

首先判断文档类型：
1. **需求规格说明书**：包含功能需求、业务规则、用户故事等 → 提取为正式需求
2. **辅助文档**（如操作手册、部门通讯录、账号密码表、接口文档、原型图等）：不作为独立需求提取，但其中的关键信息（如测试账号、部门名称、接口地址等）需要在「待确认」字段中标注，这些信息在编写测试用例时会用到
3. **非相关文档**（如会议纪要、行政通知等）：跳过，不提取需求

## 需求提取规则

从需求文档中提取每一条独立的业务需求，要求：
- 每条需求必须是可测试的（遵循 INVEST 原则中的 Testable）
- 识别需求之间的依赖关系
- 对模糊或不完整的需求标注待确认问题
- 识别潜在的风险点（如数据安全、并发处理、异常流程等）

## 风险评估标准

- **高风险**：涉及资金、权限、数据安全、核心业务流程、多系统交互
- **中风险**：涉及常规业务逻辑、数据校验、状态流转
- **低风险**：涉及界面展示、静态文案、非核心辅助功能

## 输出格式

以 JSON 数组格式输出，每个元素包含以下字段：
- module: 所属功能模块（2-4 个字，如"用户管理"、"订单处理"）
- feature: 功能点名称（简洁描述，如"登录验证"、"密码重置"）
- source: 来源（文档名称或章节位置，便于溯源）
- risk: 风险等级（高/中/低，基于上述评估标准）
- rule: 业务规则描述（详细描述该需求的业务逻辑，包含输入条件、处理逻辑、输出结果）
- question: 待确认的问题（需求不明确、存在歧义、或需要辅助文档补充信息的地方）

只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请以资深测试工程师的视角，对以下文档内容进行专业的需求分析。\n\n注意区分需求文档和辅助文档，辅助文档中的关键测试数据（如账号、密码、部门信息等）请在待确认字段中标注。\n\n文档内容：\n\n{file_content[:3000]}"

        response = await self._call_llm(system_prompt, user_prompt, "需求解析", user_id)
        return self._parse_json_response(response)

    async def generate_test_points(self, requirements_text: str, user_id: str = "") -> list[dict]:
        """Generate test points from requirements."""
        system_prompt = """你是一位具有 10 年以上经验的高级软件测试架构师，精通测试设计方法论（等价类划分、边界值分析、判定表、因果图、正交实验、场景法等）。你的任务是根据需求生成全面、系统的测试点。

## 测试设计原则

遵循 ISTQB 测试设计标准，确保测试点覆盖以下维度：
1. **功能测试**：验证每个功能点的正确性
2. **边界测试**：验证输入边界值（最小值、最大值、临界值、空值、特殊字符）
3. **异常测试**：验证系统对异常输入和异常操作的处理能力
4. **权限测试**：验证不同角色的访问控制和操作权限
5. **数据测试**：验证数据的完整性、一致性、持久性
6. **状态测试**：验证业务状态流转的正确性
7. **兼容性测试**：验证不同环境、浏览器、设备的兼容性（如适用）
8. **性能测试**：关注并发、大数据量等性能相关场景（如适用）

## 优先级定义

- **P0（冒烟测试）**：核心业务流程，阻塞性功能，每次构建必须执行
- **P1（系统测试）**：重要功能，高优先级业务规则
- **P2（回归测试）**：一般功能，次要业务规则
- **P3（探索测试）**：边缘场景，低频操作，UI 细节

## 自动化评估标准

- **适合自动化**：重复执行、数据驱动、回归测试、流程固定的操作
- **不适合自动化**：涉及主观判断、随机操作、一次性测试、复杂环境依赖

## 输出要求

- 每个测试点必须是独立的、可验证的
- 同一模块的测试点集中在一起，按优先级从高到低排列
- 测试点标题要简洁明确，能直接反映验证目标
- 描述要包含验证的具体内容和预期行为

以 JSON 数组格式输出，每个元素包含以下字段：
- module: 所属模块（与需求模块保持一致）
- type: 测试类型（正常流程/异常流程/边界值/权限控制/数据一致性/状态流转）
- title: 测试点标题（简洁描述要验证的内容）
- description: 详细描述（包含验证的具体内容、输入条件、预期行为）
- priority: 优先级（P0/P1/P2/P3）
- automatable: 是否可自动化（true/false）

只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请以资深测试架构师的视角，根据以下需求生成全面的测试点。要求覆盖正常流程、异常流程、边界值、权限控制、数据一致性、状态流转等维度，并给出合理的优先级和自动化评估。\n\n需求列表：\n\n{requirements_text[:3000]}"

        response = await self._call_llm(system_prompt, user_prompt, "测试点生成", user_id)
        return self._parse_json_response(response)

    async def generate_test_cases(self, test_points_text: str, user_id: str = "") -> list[dict]:
        """Generate test cases from test points."""
        system_prompt = """你是一位具有 10 年以上经验的高级软件测试工程师，精通测试用例设计和编写规范。你的任务是根据测试点生成可执行的、高质量的测试用例。

## 用例编号规则

- 编号由系统自动生成（格式 TC_XXX_NNN，如 TC_USER_001、TC_MENU_001），不需要提供 caseCode 字段
- 编号只包含英文字母和数字，禁止包含中文

## 用例编写规范

每条用例必须包含：
1. **明确的前置条件**：执行用例前需要满足的环境、数据、权限等条件
2. **可执行的测试步骤**：步骤编号清晰，操作描述具体，不产生歧义
3. **具体的测试数据**：提供真实的、有代表性的测试数据（包含正常值、边界值、异常值）
4. **可验证的预期结果**：结果描述具体、可量化，避免"正常"、"正确"等模糊表述

## 测试步骤写法（必须严格遵守）

- 使用"步骤N:"格式，不能写成"1."、"2."、"3."
- 每个步骤只包含一个操作，避免合并多个操作到一个步骤
- 步骤中要体现验证点，用"查看...是否..."的句式
- 正确示例：步骤1: 点击顶部导航栏"客户管理"菜单
- 正确示例：步骤2: 查看客户列表是否加载成功并显示数据
- 错误示例：1. 点击菜单（缺少步骤前缀和验证点）

## 预期结果写法（必须严格遵守）

- 只写验证点对应的期望，不要把所有操作步骤都搬过来
- 必须包含关键词"应"，描述系统正常表现
- 正确示例：步骤2: 客户列表应加载成功并显示至少一条数据
- 错误示例：用户点击菜单后，系统打开客户管理页面，列表正常加载（缺少步骤编号和"应"字）

## 数据具体化

- 不使用"输入正确的用户名"，而是"输入用户名: admin"
- 不使用"提示成功"，而是"提示'登录成功'并跳转至首页"

## 自动化评估标准

- **适合**：流程固定、数据可参数化、步骤可脚本化、结果可断言
- **不适合**：涉及视觉判断、物理操作、随机数据、复杂环境交互
- **待评估**：需要人工进一步判断的场景

## 优先级定义

- **P0（冒烟测试）**：核心业务流程，阻塞性功能，每次构建必须执行
- **P1（系统测试）**：重要功能，高优先级业务规则
- **P2（回归测试）**：一般功能，次要业务规则
- **P3（探索测试）**：边缘场景，低频操作，UI 细节

## 输出要求

- 同一模块的用例集中在一起，按优先级从高到低排列
- 测试步骤使用换行符分隔，每步一行
- 测试数据要具体、可执行，包含多种场景
- 每条用例只验证一个主要目标

以 JSON 数组格式输出，每个元素包含以下字段：
- module: 所属模块（与测试点模块保持一致）
- feature: 功能点（与测试点功能点保持一致）
- title: 用例标题（格式：[场景] + [操作] + [预期结果]）
- priority: 优先级（P0/P1/P2/P3）
- precondition: 前置条件（包含环境、账号、权限、测试数据等）
- steps: 测试步骤（用"步骤N:"格式，换行符分隔，每步一行，包含验证点）
- testData: 测试数据（具体的输入值，包含正常和异常场景）
- expectedResult: 预期结果（包含步骤编号和"应"字，具体可验证）
- testType: 测试类型（功能测试/接口测试/性能测试/安全测试/兼容性测试）
- automation: 自动化标识（适合/不适合/待评估）

只输出 JSON 数组，不要其他内容。"""

        user_prompt = (
            "请以资深测试工程师的视角，根据以下测试点生成可执行的测试用例。要求："
            "1. 步骤使用 步骤N: 格式，每步包含验证点（用 查看...是否... 句式） "
            "2. 预期结果包含步骤编号和 应 字 "
            "3. 数据具体化，不使用模糊描述 "
            "4. 编号格式 TC_XXX_NNN"
            f"\n\n测试点列表：\n\n{test_points_text[:3000]}"
        )

        response = await self._call_llm(system_prompt, user_prompt, "用例生成", user_id, max_tokens=16000)
        return self._parse_json_response(response)

    async def review_test_cases(self, test_cases_text: str, user_id: str = "") -> dict:
        """AI review test cases and provide quality assessment."""
        system_prompt = """你是一位具有 10 年以上经验的高级质量保障专家（QA Lead），精通测试用例评审和质量度量。你的任务是对测试用例进行专业评审，发现缺陷和改进点。

## 评审维度

### 1. 完整性评审
- 需求覆盖：每条用例是否覆盖了明确的业务需求
- 场景覆盖：正常流程、异常流程、边界条件是否全面
- 角色覆盖：不同权限角色的测试是否充分
- 数据覆盖：输入数据的等价类划分是否合理

### 2. 准确性评审
- 步骤清晰度：测试步骤是否具体、无歧义，新手也能执行
- 预期结果：是否可量化、可验证，避免"正常"、"正确"等模糊词
- 前置条件：是否完整描述了执行环境和数据准备
- 测试数据：是否提供了具体的数据值，而非泛化描述

### 3. 可执行性评审
- 步骤粒度：每步是否只包含一个操作
- 数据依赖：测试数据是否可获取、可准备
- 环境依赖：是否明确了所需的环境配置
- 工具依赖：是否需要特殊工具或权限

### 4. 一致性评审
- 命名规范：标题格式是否统一
- 编号连续性：编号是否连续无跳号
- 优先级合理性：优先级分配是否与业务重要性匹配
- 自动化标记：标记是否准确（适合/不适合/待评估）

### 5. 风险覆盖评审
- 边界值：是否覆盖了最小值、最大值、临界值、空值、特殊字符
- 并发场景：是否有并发操作的测试
- 安全测试：是否有权限越权、注入等安全相关测试
- 数据一致性：是否有数据持久化、事务回滚等测试

## 评审输出

对每个评审维度给出：
- 评分（1-5分，5分最高）
- 发现的问题列表
- 改进建议

以 JSON 格式输出：
{
  "overallScore": 总体评分(1-100),
  "overallLevel": "优秀/良好/合格/需改进",
  "dimensions": [
    {
      "name": "维度名称",
      "score": 评分(1-5),
      "issues": ["问题1", "问题2"],
      "suggestions": ["建议1", "建议2"]
    }
  ],
  "summary": "总体评价（2-3句话）",
  "mustFix": ["必须修复的问题列表"],
  "recommendations": ["改进建议列表"]
}"""

        user_prompt = f"请对以下测试用例进行全面的质量评审，从完整性、准确性、可执行性、一致性、风险覆盖五个维度进行评估。\n\n测试用例列表：\n\n{test_cases_text[:4000]}"

        response = await self._call_llm(system_prompt, user_prompt, "用例评审", user_id)
        return self._parse_json_response(response)

    async def generate_automation_scripts(self, test_cases_text: str, user_id: str = "") -> list[dict]:
        """Generate Playwright automation scripts from test cases using AI."""
        system_prompt = """你是一位具有 8 年以上经验的自动化测试架构师，精通 Playwright 框架和 Python/TypeScript 编程。你的任务是根据测试用例生成可直接运行的、高质量的自动化测试脚本。

## 脚本生成原则

### 1. 代码质量
- 遵循 PEP 8（Python）或 ESLint 规范（TypeScript）
- 使用 Page Object Model（POM）设计模式组织代码
- 每个页面元素使用语义化定位器（data-testid > ARIA > CSS Selector）
- 避免硬编码等待，优先使用 Playwright 内置等待机制

### 2. 脚本结构
每个脚本必须包含：
```python
import asyncio
from playwright.async_api import async_playwright

async def test_<功能描述>():
    \"\"\"测试用例: <用例标题>
    编号: <caseCode>
    优先级: <priority>
    模块: <module>
    \"\"\"
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        try:
            # 前置条件
            <precondition代码>
            # 测试步骤
            <step1代码>
            <step2代码>
            # 预期结果断言
            <assertion代码>
            print("✅ 测试通过")
        except Exception as e:
            print(f"❌ 测试失败: {{e}}")
            raise
        finally:
            await browser.close()
```

### 3. 断言要求
- 每个测试步骤后必须有对应的断言
- 使用 Playwright 的 expect API 进行断言
- 断言必须具体：验证文本内容、元素状态、URL 变化等
- 避免空断言或注释占位符

### 4. 数据驱动
- 测试数据应参数化，便于复用
- 使用变量存储测试数据，而非直接写入操作步骤
- 支持多种测试场景（正常、异常、边界）

### 5. 错误处理
- 每个关键操作使用 try-except 捕获异常
- 提供清晰的错误信息，便于定位问题
- 使用 finally 确保资源释放

## 输出格式

以 JSON 数组格式输出，每个元素包含以下字段：
- testCaseId: 对应的测试用例ID
- scriptType: 脚本类型（UI/API/混合）
- framework: 框架（Playwright）
- language: 编程语言（Python 或 TypeScript）
- code: 完整的可执行脚本代码
- description: 脚本功能简述（1-2句话）

注意：
- 代码必须是完整的、可直接运行的，不能有 TODO 或占位符
- 根据用例的测试步骤生成具体的操作代码
- 根据预期结果生成具体的断言代码
- 如果用例涉及登录，生成登录相关代码
- 如果用例涉及表单填写，生成具体的输入代码

只输出 JSON 数组，不要其他内容。"""

        user_prompt = f"请根据以下测试用例生成可直接运行的 Playwright 自动化测试脚本。要求代码完整、断言具体、结构清晰，遵循 Page Object Model 模式。\n\n测试用例列表：\n\n{test_cases_text[:4000]}"

        response = await self._call_llm(system_prompt, user_prompt, "脚本生成", user_id)
        return self._parse_json_response(response)

    async def analyze_script_execution(self, scripts_text: str, execution_results: str, user_id: str = "") -> dict:
        """AI analysis of script execution results and generate report."""
        system_prompt = """你是一位具有 8 年以上经验的自动化测试执行专家，精通测试结果分析和缺陷定位。你的任务是对自动化脚本的执行结果进行分析，生成执行报告和缺陷报告。

## 分析维度

### 1. 执行概览
- 总脚本数、通过数、失败数、跳过数
- 通过率计算和趋势分析
- 执行耗时统计

### 2. 失败分析
对每个失败的脚本：
- 失败原因分类（脚本问题/环境问题/应用缺陷）
- 失败位置定位（具体步骤和行号）
- 错误信息解读
- 修复建议

### 3. 缺陷识别
- 识别真正的应用缺陷（非脚本问题）
- 缺陷严重程度评估（P0-P3）
- 缺陷复现步骤
- 预期行为 vs 实际行为

### 4. 脚本质量评估
- 脚本稳定性评分
- 脚本维护性建议
- 优化建议

### 5. 执行报告
生成结构化的执行报告，包含：
- 执行摘要
- 失败用例详情
- 缺陷列表
- 修复优先级建议
- 后续行动建议

## 输出格式

以 JSON 格式输出：
{
  "summary": {
    "total": 总脚本数,
    "passed": 通过数,
    "failed": 失败数,
    "skipped": 跳过数,
    "passRate": "通过率百分比",
    "duration": "执行耗时"
  },
  "failures": [
    {
      "scriptId": "脚本ID",
      "scriptName": "脚本名称",
      "failureType": "脚本问题/环境问题/应用缺陷",
      "errorInfo": "错误信息",
      "failureStep": "失败步骤",
      "suggestion": "修复建议"
    }
  ],
  "defects": [
    {
      "severity": "P0/P1/P2/P3",
      "title": "缺陷标题",
      "description": "缺陷描述",
      "reproductionSteps": "复现步骤",
      "expected": "预期行为",
      "actual": "实际行为"
    }
  ],
  "scriptQuality": {
    "stabilityScore": 稳定性评分(1-10),
    "suggestions": ["优化建议"]
  },
  "recommendations": ["后续行动建议"]
}"""

        user_prompt = f"请分析以下自动化脚本的执行结果，生成详细的执行报告和缺陷报告。\n\n脚本信息：\n{scripts_text[:2000]}\n\n执行结果：\n{execution_results[:2000]}"

        response = await self._call_llm(system_prompt, user_prompt, "执行脚本", user_id)
        return self._parse_json_response(response)

    async def generate_test_documents(self, project_info: str, requirements_text: str, test_points_text: str, test_cases_text: str, user_id: str = "") -> dict:
        """AI generate test documentation (test plan, test report, etc.)."""
        system_prompt = """你是一位具有 10 年以上经验的测试管理专家，精通测试文档编写和测试过程管理。你的任务是根据项目信息和测试数据生成规范的测试文档。

## 支持的文档类型

### 1. 测试计划（Test Plan）
包含以下章节：
- 测试范围（In Scope / Out of Scope）
- 测试策略（功能测试、性能测试、安全测试等）
- 测试环境要求
- 资源安排（人员、工具、时间）
- 进入/退出标准
- 风险评估
- 里程碑计划

### 2. 测试报告（Test Report）
包含以下章节：
- 执行摘要（通过率、缺陷密度、风险评估）
- 测试范围回顾
- 测试执行情况（用例数、通过率、缺陷数）
- 缺陷分析（按严重程度、模块分布）
- 遗留问题和风险
- 测试结论和建议

### 3. 测试用例清单（Test Case Summary）
- 按模块分组的用例统计
- 优先级分布
- 自动化覆盖率
- 评审状态统计

### 4. 缺陷报告（Defect Report）
- 缺陷统计
- 严重程度分布
- 模块分布
- 修复建议

## 输出格式

以 JSON 格式输出：
{
  "documentType": "测试计划/测试报告/用例清单/缺陷报告",
  "title": "文档标题",
  "content": "Markdown 格式的文档内容",
  "metadata": {
    "generatedAt": "生成时间",
    "version": "版本号",
    "author": "AI 测试助手"
  }
}

注意：
- 文档内容使用 Markdown 格式
- 包含具体的统计数据（从提供的数据中提取）
- 符合行业标准（IEEE 829/ISTQB）
- 内容完整、结构清晰、可直接使用

只输出 JSON 对象，不要其他内容。"""

        user_prompt = f"请根据以下项目信息生成测试文档。\n\n项目信息：\n{project_info[:1000]}\n\n需求列表：\n{requirements_text[:1500]}\n\n测试点列表：\n{test_points_text[:1500]}\n\n测试用例列表：\n{test_cases_text[:1500]}"

        response = await self._call_llm(system_prompt, user_prompt, "文档生成", user_id)
        return self._parse_json_response(response)
