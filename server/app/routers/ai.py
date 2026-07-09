import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.models.ai_task import AITask
from app.models.file_asset import FileAsset
from app.models.status_log import StatusLog
from app.models.project import Project
from app.models.requirement import Requirement
from app.models.test_point import TestPoint
from app.models.test_case import TestCase
from app.routers.auth import get_current_user
from app.services.ai_service import AIService, check_config_for_task
from app.utils import model_to_dict
from app.utils import verify_project_owner

logger = logging.getLogger(__name__)


def _friendly_error(err: Exception) -> str:
    """将后端异常转换为中文用户友好提示"""
    msg = str(err)
    # HTTP 状态码错误
    if "404" in msg or "Not Found" in msg:
        return "模型服务地址不可用（404），请在模型配置中检查 API 地址是否正确"
    if "401" in msg or "Unauthorized" in msg or "403" in msg or "Forbidden" in msg:
        return "API Key 无效或无权限，请在模型配置中检查 API Key"
    if "429" in msg or "Too Many Requests" in msg or "Rate limit" in msg:
        return "模型服务请求过于频繁（限流），请稍后重试"
    if "500" in msg or "502" in msg or "503" in msg or "Internal Server" in msg or "Bad Gateway" in msg or "Service Unavailable" in msg:
        return "模型服务暂时不可用，请稍后重试"
    if "Connect" in msg or "connect" in msg or "ConnectionRefused" in msg:
        return "无法连接到模型服务，请检查网络连接或模型配置中的 API 地址"
    if "Timeout" in msg or "timeout" in msg:
        return "模型服务响应超时，请检查网络连接后重试"
    if "SSL" in msg or "ssl" in msg:
        return "SSL 连接错误，请检查网络环境"
    if "JSONDecodeError" in msg or "json" in msg.lower():
        return "模型返回的数据格式异常，无法解析，请稍后重试"
    if "KeyError" in msg:
        return "模型返回数据结构异常，请稍后重试"
    # AI 配置相关
    if "配置不存在" in msg or "模型配置" in msg:
        return msg  # 已经是中文了
    if "请先" in msg:
        return msg
    # 默认兜底
    return f"解析失败：{msg[:200]}"



router = APIRouter()
ai_service = AIService()


# ─── 工具函数 ───

async def _update_task_status(db: AsyncSession, task_id: str, status: str, error: str | None = None):
    result = await db.execute(select(AITask).where(AITask.id == task_id))
    task = result.scalar_one_or_none()
    if task:
        task.status = status
        task.finished_at = datetime.now(timezone.utc)
        if error:
            task.error_message = error[:2000]
        await db.commit()


def _module_counter(items: list[dict], prefix: str) -> list[tuple[str, str]]:
    """为按模块分组的项目生成编号。返回 [(id, module), ...]
    编号格式: PREFIX_NNN（纯英文+数字，不含中文）
    """
    counter = 0
    result = []
    for item in items:
        module = item["module"]
        counter += 1
        result.append((f"{prefix}_{counter:03d}", module))
    return result


def _read_file_content(file_obj: FileAsset) -> str:
    """读取单个文件的内容，返回文本。"""
    if not file_obj.storage_path or not os.path.exists(file_obj.storage_path):
        return ""

    ext = file_obj.name.rsplit(".", 1)[-1].lower() if "." in file_obj.name else ""

    try:
        if ext in ("docx", "doc"):
            from docx import Document
            doc = Document(file_obj.storage_path)
            text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            return text[:5000]

        if ext in ("xlsx", "xls"):
            import openpyxl
            wb = openpyxl.load_workbook(file_obj.storage_path, read_only=True, data_only=True)
            parts = []
            for sheet in wb.sheetnames:
                ws = wb[sheet]
                rows = [
                    " | ".join(str(c) if c is not None else "" for c in row)
                    for row in ws.iter_rows(values_only=True)
                ]
                rows = [r for r in rows if r.strip()]
                if rows:
                    parts.append(f"Sheet: {sheet}\n" + "\n".join(rows[:100]))
            wb.close()
            return "\n".join(parts)[:5000]

        if ext == "pdf":
            import PyPDF2
            reader = PyPDF2.PdfReader(file_obj.storage_path)
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
            return text[:5000]

        if ext in ("md", "txt", "json", "yaml", "yml", "csv"):
            with open(file_obj.storage_path, "r", errors="ignore") as fh:
                return fh.read()[:5000]

        return f"(不支持的格式: {ext})"

    except Exception as e:
        return f"(读取失败: {str(e)[:100]})"


# ─── 后台任务 ───

async def run_parse_requirements(task_id: str, project_id: str, file_content: str, user_id: str):
    async with async_session() as db:
        try:
            file_result = await db.execute(
                select(FileAsset).where(FileAsset.project_id == project_id)
            )
            files = file_result.scalars().all()

            for f in files:
                f.parse_status = "解析中"
            await db.commit()

            requirements = await ai_service.parse_requirements(file_content, user_id)
            logger.info(f"parse_requirements: type={type(requirements).__name__}, len={len(requirements) if isinstance(requirements, (list, dict)) else 'N/A'}")

            # 确保返回的是列表；如果 LLM 返回了 dict，尝试从各种常见结构中提取列表
            if isinstance(requirements, dict):
                for v in requirements.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict) and "module" in v[0]:
                        requirements = v
                        break
                if isinstance(requirements, dict):
                    for k, v in requirements.items():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            requirements = v
                            logger.info(f"extracted list from dict key '{k}', len={len(v)}")
                            break
            if not isinstance(requirements, list) or not requirements:
                logger.error(f"parse_requirements: invalid result, type={type(requirements).__name__}, preview={str(requirements)[:500]}")
                for f in files:
                    f.parse_status = "失败"
                    f.parse_error = "AI 未返回有效的解析数据"
                await db.commit()
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的解析数据，请检查模型配置或文件内容后重试")
                return

            for req in requirements:
                db.add(Requirement(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    module=req["module"],
                    feature=req["feature"],
                    source=req.get("source", ""),
                    risk=req.get("risk", "中"),
                    rule=req.get("rule", ""),
                    question=req.get("question", ""),
                ))

            for f in files:
                f.parse_status = "已完成"
                f.parse_error = ""

            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            error_msg = _friendly_error(e)
            logger.exception("run_parse_requirements failed")
            try:
                file_result = await db.execute(
                    select(FileAsset).where(FileAsset.project_id == project_id)
                )
                for f in file_result.scalars().all():
                    f.parse_status = "失败"
                    f.parse_error = error_msg
                
                # 记录解析失败日志（不改变test_status，保持"测试中"状态）
                
                await db.commit()
            except Exception:
                logger.exception("Failed to update file status on error")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


async def run_generate_test_points(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements = result.scalars().all()
            if not requirements:
                await _update_task_status(db, task_id, "失败", "需求列表为空，无法生成测试点")
                return
            req_text = "\n".join(
                f"- 模块:{r.module} 功能:{r.feature} 规则:{r.rule}" for r in requirements
            )
            points = await ai_service.generate_test_points(req_text, user_id)
            logger.info(f"generate_test_points: type={type(points).__name__}, len={len(points) if isinstance(points, (list, dict)) else 'N/A'}")

            # 确保返回的是列表；如果 LLM 返回了 dict，尝试从各种常见结构中提取列表
            if isinstance(points, dict):
                for v in points.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict) and "module" in v[0]:
                        points = v
                        break
                if isinstance(points, dict):
                    for k, v in points.items():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            points = v
                            logger.info(f"extracted list from dict key '{k}', len={len(v)}")
                            break
            if not isinstance(points, list) or not points:
                logger.error(f"generate_test_points: invalid result, type={type(points).__name__}, preview={str(points)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试点数据，请检查模型配置或需求数据后重试")
                return

            for (tp_id, _), pt in zip(_module_counter(points, "TP"), points):
                db.add(TestPoint(
                    id=tp_id,
                    project_id=project_id,
                    module=pt["module"],
                    type=pt["type"],
                    title=pt["title"],
                    description=pt.get("description", ""),
                    priority=pt.get("priority", "P1"),
                    automatable=pt.get("automatable", False),
                ))


            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            logger.exception("run_generate_test_points failed")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


async def run_generate_test_cases(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            tp_result = await db.execute(
                select(TestPoint).where(TestPoint.project_id == project_id)
            )
            points = tp_result.scalars().all()
            pt_text = "\n".join(
                f"- 模块:{tp.module} 类型:{tp.type} 标题:{tp.title} 优先级:{tp.priority}"
                for tp in points
            )
            cases = await ai_service.generate_test_cases(pt_text, user_id)
            logger.info(f"generate_test_cases: type={type(cases).__name__}, len={len(cases) if isinstance(cases, (list, dict)) else 'N/A'}")

            # 确保返回的是列表；如果 LLM 返回了 dict，尝试从各种常见结构中提取列表
            if isinstance(cases, dict):
                # 方式1: 直接检查第一个值是否为 dict list
                for v in cases.values():
                    if isinstance(v, list) and v and isinstance(v[0], dict) and "module" in v[0]:
                        cases = v
                        break
                # 方式2: key 名包含 cases/test_cases/testcase 的 dict
                if isinstance(cases, dict):
                    for k, v in cases.items():
                        if isinstance(v, list) and v and isinstance(v[0], dict):
                            cases = v
                            logger.info(f"extracted list from dict key '{k}', len={len(v)}")
                            break
            if not isinstance(cases, list) or not cases:
                logger.error(f"generate_test_cases: invalid result, type={type(cases).__name__}, preview={str(cases)[:500]}")
                await _update_task_status(db, task_id, "失败", "AI 未返回有效的测试用例数据，请检查模型配置或测试点数据后重试")
                return

            for (case_code, _), c in zip(_module_counter(cases, "TC"), cases):
                db.add(TestCase(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    case_code=case_code,
                    module=c["module"],
                    feature=c.get("feature", ""),
                    title=c["title"],
                    priority=c.get("priority", "P1"),
                    precondition=c.get("precondition", ""),
                    steps=c.get("steps", ""),
                    test_data=c.get("testData", ""),
                    expected_result=c.get("expectedResult", ""),
                    test_type=c.get("testType", "功能测试"),
                    automation=c.get("automation", "待评估"),
                ))


            await db.commit()
            await _update_task_status(db, task_id, "成功")

        except Exception as e:
            logger.exception("run_generate_test_cases failed")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


# ─── 路由 ───

@router.get("/projects/{project_id}/ai/tasks")
async def list_ai_tasks(
    project_id: str,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    result = await db.execute(
        select(AITask).where(AITask.project_id == project_id).order_by(AITask.created_at.desc())
    )
    return [model_to_dict(t) for t in result.scalars().all()]


@router.get("/projects/{project_id}/ai/check-config/{task_type}")
async def check_ai_config(
    project_id: str,
    task_type: str,
    user: dict = Depends(get_current_user),
):
    """检查用户是否已配置指定 AI 任务的模型"""
    result = await check_config_for_task(task_type, user["sub"])
    return result


@router.post("/projects/{project_id}/ai/parse-requirements")
async def parse_requirements(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查配置
    config_check = await check_config_for_task("需求解析", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    file_result = await db.execute(
        select(FileAsset).where(FileAsset.project_id == project_id)
    )
    files = file_result.scalars().all()
    if not files:
        return {"error": "No files found. Please upload files first."}

    content_parts = []
    for f in files:
        text = _read_file_content(f)
        if text:
            content_parts.append(f"[{f.name}]\n{text}")

    file_content = "\n---\n".join(content_parts) if content_parts else "No readable content"

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="需求解析",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_parse_requirements, task.id, project_id, file_content, user["sub"])
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-points")
async def generate_test_points(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查是否有需求数据
    req_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    if not req_result.scalars().first():
        raise HTTPException(status_code=400, detail="需求列表为空，请先在「需求列表」页面完成需求解析")

    # 检查配置
    config_check = await check_config_for_task("测试点生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="测试点生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_points, task.id, project_id, user["sub"])
    return model_to_dict(task)


@router.post("/projects/{project_id}/ai/generate-test-cases")
async def generate_test_cases(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])
    # 检查配置
    config_check = await check_config_for_task("用例生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="用例生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_test_cases, task.id, project_id, user["sub"])
    return model_to_dict(task)


# ─── 用例评审 ───

async def run_review_test_cases(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            result = await db.execute(
                select(TestCase).where(TestCase.project_id == project_id)
            )
            cases = result.scalars().all()
            if not cases:
                await _update_task_status(db, task_id, "失败", "测试用例列表为空，无法评审")
                return

            tc_text = "\n".join(
                f"- 编号:{c.case_code} 模块:{c.module} 标题:{c.title} 优先级:{c.priority} "
                f"步骤:{c.steps or '无'} 预期结果:{c.expected_result or '无'} "
                f"自动化:{c.automation} 评审状态:{c.review_status or '待评审'}"
                for c in cases
            )

            review_result = await ai_service.review_test_cases(tc_text, user_id)

            # 将评审结果保存到 AITask 的 result 字段
            task_result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = task_result.scalar_one_or_none()
            if task:
                import json
                task.result = json.dumps(review_result, ensure_ascii=False) if isinstance(review_result, dict) else str(review_result)

            await _update_task_status(db, task_id, "成功")
        except Exception as e:
            logger.exception("run_review_test_cases failed")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


@router.post("/projects/{project_id}/ai/review-test-cases")
async def review_test_cases(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    # 检查是否有测试用例
    tc_result = await db.execute(
        select(TestCase).where(TestCase.project_id == project_id)
    )
    if not tc_result.scalars().first():
        raise HTTPException(status_code=400, detail="测试用例列表为空，请先生成测试用例")

    # 检查配置
    config_check = await check_config_for_task("用例评审", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="用例评审",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_review_test_cases, task.id, project_id, user["sub"])
    return model_to_dict(task)


# ─── 执行脚本分析 ───

async def run_execute_scripts_analysis(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            from app.models.automation_script import AutomationScript
            result = await db.execute(
                select(AutomationScript).where(AutomationScript.project_id == project_id)
            )
            scripts = result.scalars().all()
            if not scripts:
                await _update_task_status(db, task_id, "失败", "自动化脚本列表为空，无法分析")
                return

            scripts_text = "\n".join(
                f"- ID:{s.id} 类型:{s.script_type} 框架:{s.framework} 语言:{s.language} "
                f"状态:{s.status} 代码片段:{(s.code or '')[:200]}"
                for s in scripts
            )

            execution_results = "当前脚本状态统计：" + "\n".join(
                f"- {s.status}: {sum(1 for x in scripts if x.status == s.status)} 个"
                for s in scripts
            )

            analysis = await ai_service.analyze_script_execution(scripts_text, execution_results, user_id)

            task_result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = task_result.scalar_one_or_none()
            if task:
                import json
                task.result = json.dumps(analysis, ensure_ascii=False) if isinstance(analysis, dict) else str(analysis)

            await _update_task_status(db, task_id, "成功")
        except Exception as e:
            logger.exception("run_execute_scripts_analysis failed")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


@router.post("/projects/{project_id}/ai/execute-scripts")
async def execute_scripts(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    from app.models.automation_script import AutomationScript
    script_result = await db.execute(
        select(AutomationScript).where(AutomationScript.project_id == project_id)
    )
    if not script_result.scalars().first():
        raise HTTPException(status_code=400, detail="自动化脚本列表为空，请先生成脚本")

    config_check = await check_config_for_task("执行脚本", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="执行脚本",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_execute_scripts_analysis, task.id, project_id, user["sub"])
    return model_to_dict(task)


# ─── 文档生成 ───

async def run_generate_docs(task_id: str, project_id: str, user_id: str):
    async with async_session() as db:
        try:
            from app.models.project import Project

            # 获取项目信息
            proj_result = await db.execute(select(Project).where(Project.id == project_id))
            project = proj_result.scalar_one_or_none()
            
            # 更新项目文档状态为"生成中"
            if project:
                old_doc_status = project.doc_status
                project.doc_status = "生成中"
                db.add(StatusLog(
                    project_id=project_id,
                    user_id=user_id,
                    field_name="doc_status",
                    old_value=old_doc_status,
                    new_value="生成中",
                    change_type="auto",
                    reason="开始生成测试文档"
                ))
            
            project_info = f"项目名称:{project.name if project else '未知'}"

            # 获取需求
            req_result = await db.execute(
                select(Requirement).where(Requirement.project_id == project_id)
            )
            requirements = req_result.scalars().all()
            req_text = "\n".join(
                f"- 模块:{r.module} 功能:{r.feature} 规则:{r.rule}" for r in requirements
            ) if requirements else "暂无需求"

            # 获取测试点
            tp_result = await db.execute(
                select(TestPoint).where(TestPoint.project_id == project_id)
            )
            points = tp_result.scalars().all()
            tp_text = "\n".join(
                f"- 编号:{tp.id} 模块:{tp.module} 标题:{tp.title} 优先级:{tp.priority}"
                for tp in points
            ) if points else "暂无测试点"

            # 获取测试用例
            tc_result = await db.execute(
                select(TestCase).where(TestCase.project_id == project_id)
            )
            cases = tc_result.scalars().all()
            tc_text = "\n".join(
                f"- 编号:{c.case_code} 模块:{c.module} 标题:{c.title} 优先级:{c.priority} 自动化:{c.automation}"
                for c in cases
            ) if cases else "暂无测试用例"

            doc_result = await ai_service.generate_test_documents(
                project_info, req_text, tp_text, tc_text, user_id
            )

            task_result = await db.execute(select(AITask).where(AITask.id == task_id))
            task = task_result.scalar_one_or_none()
            if task:
                import json
                task.result = json.dumps(doc_result, ensure_ascii=False) if isinstance(doc_result, dict) else str(doc_result)

            # 更新项目文档状态为"已完成"
            if project:
                project.doc_status = "已完成"
                db.add(StatusLog(
                    project_id=project_id,
                    user_id=user_id,
                    field_name="doc_status",
                    old_value="生成中",
                    new_value="已完成",
                    change_type="auto",
                    reason="测试文档生成完成"
                ))

            await _update_task_status(db, task_id, "成功")
        except Exception as e:
            logger.exception("run_generate_docs failed")
            # 文档生成失败，回退doc_status到"待生成"
            try:
                proj_result = await db.execute(select(Project).where(Project.id == project_id))
                project = proj_result.scalar_one_or_none()
                if project:
                    project.doc_status = "待生成"
                    db.add(StatusLog(
                        project_id=project_id,
                        user_id=user_id,
                        field_name="doc_status",
                        old_value="生成中",
                        new_value="待生成",
                        change_type="auto",
                        reason=f"文档生成失败: {_friendly_error(e)[:100]}"
                    ))
                    await db.commit()
            except Exception:
                logger.exception("Failed to update doc_status on error")
            await _update_task_status(db, task_id, "失败", _friendly_error(e))


@router.post("/projects/{project_id}/ai/generate-docs")
async def generate_docs(
    project_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await verify_project_owner(db, project_id, user["sub"])

    config_check = await check_config_for_task("文档生成", user["sub"])
    if not config_check["configured"]:
        raise HTTPException(status_code=400, detail=config_check["message"])

    task = AITask(
        id=str(uuid.uuid4()),
        project_id=project_id,
        type="文档生成",
        status="执行中",
        model_name="AI",
    )
    db.add(task)
    await db.commit()

    background_tasks.add_task(run_generate_docs, task.id, project_id, user["sub"])
    return model_to_dict(task)
