"""Build traceable AI inputs and validate references returned by the model."""

import json
import re
from collections.abc import Iterable
from typing import Any

from app.services.requirement_clarification import default_clarification_status
from app.services.script_generation_quality import enrich_script_generation_records


MAX_BATCH_CHARS = 12000
# 脚本生成单条用例就可能输出数千字符代码。按单条/小批次生成，
# 可以降低模型超时概率，并支持“边生成边落库、边展示”。
SCRIPT_BATCH_CHARS = 6000


def _json_batches(
    records: Iterable[dict[str, Any]],
    max_chars: int = MAX_BATCH_CHARS,
    max_records: int | None = None,
) -> list[str]:
    batches: list[str] = []
    current: list[dict[str, Any]] = []
    current_size = 2
    for record in records:
        encoded = json.dumps(record, ensure_ascii=False)
        if current and (
            current_size + len(encoded) + 1 > max_chars
            or (max_records is not None and len(current) >= max_records)
        ):
            batches.append(json.dumps(current, ensure_ascii=False))
            current = []
            current_size = 2
        current.append(record)
        current_size += len(encoded) + 1
    if current:
        batches.append(json.dumps(current, ensure_ascii=False))
    return batches


def _pick_element_fields(item: dict[str, Any]) -> dict[str, Any]:
    """Keep only locator-relevant fields for script generation prompts."""
    return {
        key: value
        for key in ("tag", "text", "title", "placeholder", "type", "role", "id", "name", "ariaLabel", "required", "visible")
        if (value := item.get(key)) not in (None, "", [], {})
    }


def _flatten_menu_paths(menus: list[dict[str, Any]], *, limit: int = 120) -> list[str]:
    paths: list[str] = []

    def walk(items: list[dict[str, Any]], prefix: tuple[str, ...] = ()) -> None:
        for item in items:
            if len(paths) >= limit:
                return
            title = str(item.get("title") or "").strip()
            next_prefix = prefix + (title,) if title else prefix
            if title:
                paths.append(" / ".join(next_prefix))
            children = item.get("children")
            if isinstance(children, list):
                walk(children, next_prefix)

    walk(menus)
    return paths


def _case_keywords(item: Any) -> list[str]:
    text = " ".join(
        str(value or "")
        for value in (
            getattr(item, "module", ""),
            getattr(item, "feature", ""),
            getattr(item, "title", ""),
            getattr(item, "steps", ""),
            getattr(item, "expected_result", ""),
        )
    )
    candidates = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_-]{2,}", text)
    stop_words = {
        "测试", "验证", "页面", "系统", "功能", "成功", "失败", "显示", "进入", "点击",
        "进行", "支持", "能够", "用户", "操作", "信息", "检查", "应当", "是否",
    }
    keywords: list[str] = []
    for word in candidates:
        normalized = word.strip()
        if not normalized or normalized in stop_words:
            continue
        if normalized not in keywords:
            keywords.append(normalized)
    return keywords[:20]


def _compact_ui_context_for_script(context: dict[str, Any], item: Any) -> dict[str, Any]:
    """Create a small, per-case UI context instead of repeating the full UI tree.

    The full system-recognition snapshot can contain a large nested menu tree.
    Repeating it on every test case makes script generation split into many
    LLM calls. Scripts only need login locators, a few visible controls, and
    menu hints relevant to the current case.
    """
    menu_paths = _flatten_menu_paths(context.get("menus") or [])
    keywords = _case_keywords(item)
    matched_menu_paths = [
        path for path in menu_paths
        if any(keyword.lower() in path.lower() for keyword in keywords)
    ]
    selected_menu_paths = (matched_menu_paths or menu_paths)[:16]

    buttons = [
        _pick_element_fields(button)
        for button in (context.get("buttons") or [])
        if isinstance(button, dict) and (button.get("visible") or button.get("text") or button.get("title"))
    ][:12]
    login_inputs = [
        _pick_element_fields(input_item)
        for input_item in (context.get("loginInputs") or [])
        if isinstance(input_item, dict)
    ][:8]

    login_buttons = [
        _pick_element_fields(button)
        for button in (context.get("loginButtons") or [])
        if isinstance(button, dict) and (button.get("visible") or button.get("text") or button.get("title"))
    ][:6]

    ai_analysis = context.get("aiAnalysis") if isinstance(context.get("aiAnalysis"), dict) else {}
    script_guidance = ai_analysis.get("scriptGuidance") if isinstance(ai_analysis.get("scriptGuidance"), list) else []

    # AI 结构化页面对象：含每个元素的 selector/selectorType/action，
    # 是脚本生成最依赖的精确定位器来源。按关键词筛选相关页面。
    raw_pages = context.get("pageObjects") if isinstance(context.get("pageObjects"), list) else []
    page_objects = [
        {
            "pageName": page.get("pageName") or "",
            "routeOrMenuPath": page.get("routeOrMenuPath") or [],
            "purpose": page.get("purpose") or "",
            "elements": [
                {
                    "name": el.get("name") or "",
                    "type": el.get("type") or "",
                    "selector": el.get("selector") or "",
                    "selectorType": el.get("selectorType") or "",
                    "action": el.get("action") or "",
                }
                for el in (page.get("elements") or [])
                if isinstance(el, dict) and (el.get("selector") or el.get("name"))
            ][:10],
            "assertions": [a for a in (page.get("assertions") or []) if a][:5],
        }
        for page in raw_pages
        if isinstance(page, dict) and page.get("pageName")
    ][:8]

    navigation_plan = [
        {
            "fromPage": step.get("fromPage") or "",
            "toPage": step.get("toPage") or "",
            "steps": [s for s in (step.get("steps") or []) if s][:6],
        }
        for step in (context.get("navigationPlan") or [])
        if isinstance(step, dict) and (step.get("toPage") or step.get("steps"))
    ][:6]

    tables = [
        {"columns": [c for c in (table.get("columns") or []) if c][:10]}
        for table in (context.get("tables") or [])
        if isinstance(table, dict) and table.get("columns")
    ][:6]

    login_form = context.get("loginForm") if isinstance(context.get("loginForm"), dict) else {}

    return {
        "recognizedAtUrl": context.get("recognizedAtUrl") or "",
        "scopeMode": context.get("scopeMode") or "full",
        "componentHints": context.get("componentHints") or {},
        "loginInputs": login_inputs,
        "loginButtons": login_buttons,
        "loginForm": login_form,
        "menuPaths": selected_menu_paths,
        "matchedByKeywords": keywords,
        "buttons": buttons,
        "pageObjects": page_objects,
        "navigationPlan": navigation_plan,
        "tables": tables,
        "scriptGuidance": script_guidance[:5],
    }


def _compact_ui_context_for_case(context: dict[str, Any], point: Any) -> dict[str, Any]:
    """用例生成阶段的精简 UI 上下文。

    与脚本生成不同，用例生成不需要精确定位器，只需知道系统里真实存在哪些
    页面/菜单/表单字段/按钮，以便 title 能引用真实元素（如"测试登录页账号
    输入框为空时..."），而不是凭空泛化。数据量刻意保持很小，避免 batch 拆碎。
    """
    keywords = _case_keywords_for_point(point)
    menu_paths = _flatten_menu_paths(context.get("menus") or [], limit=60)
    matched_menu_paths = [
        path for path in menu_paths
        if any(keyword.lower() in path.lower() for keyword in keywords)
    ]
    selected_menu_paths = (matched_menu_paths or menu_paths)[:12]

    login_inputs = [
        _pick_element_fields(input_item)
        for input_item in (context.get("loginInputs") or [])
        if isinstance(input_item, dict)
    ][:6]
    buttons = [
        {"text": (button.get("text") or button.get("title") or "").strip()}
        for button in (context.get("buttons") or [])
        if isinstance(button, dict) and (button.get("text") or button.get("title"))
    ][:10]

    # pageObjects 来自 AI 分析，含页面名/用途/元素，用于让 title 引用真实页面
    ai_analysis = context.get("aiAnalysis") if isinstance(context.get("aiAnalysis"), dict) else {}
    raw_pages = ai_analysis.get("pageObjects") if isinstance(ai_analysis.get("pageObjects"), list) else []
    page_objects = [
        {
            "pageName": page.get("pageName") or "",
            "purpose": page.get("purpose") or "",
            "elements": [
                {"name": el.get("name") or "", "type": el.get("type") or ""}
                for el in (page.get("elements") or [])
                if isinstance(el, dict) and el.get("name")
            ][:6],
        }
        for page in raw_pages
        if isinstance(page, dict) and page.get("pageName")
    ][:6]

    return {
        "recognizedAtUrl": context.get("recognizedAtUrl") or "",
        "menuPaths": selected_menu_paths,
        "loginInputs": login_inputs,
        "buttons": buttons,
        "pageObjects": page_objects,
    }


def _case_keywords_for_point(point: Any) -> list[str]:
    """从测试点提取关键词，用于匹配相关菜单/页面。"""
    text = " ".join(
        str(value or "")
        for value in (
            getattr(point, "module", ""),
            getattr(point, "title", ""),
            getattr(point, "description", ""),
            getattr(point, "type", ""),
        )
    )
    candidates = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_-]{2,}", text)
    stop_words = {
        "测试", "验证", "页面", "系统", "功能", "成功", "失败", "显示", "进入", "点击",
        "进行", "支持", "能够", "用户", "操作", "信息", "检查", "应当", "是否",
    }
    keywords: list[str] = []
    for word in candidates:
        normalized = word.strip()
        if not normalized or normalized in stop_words:
            continue
        if normalized not in keywords:
            keywords.append(normalized)
    return keywords[:15]


def _first_environment_id(environment_context: dict[str, Any]) -> str:
    """从生成上下文提取主环境 ID，用于匹配系统识别结果。"""
    env_id = environment_context.get("environmentId") or ""
    if env_id:
        return str(env_id)
    targets = environment_context.get("targets") or []
    if isinstance(targets, list) and targets:
        first = targets[0]
        if isinstance(first, dict):
            return str(first.get("environmentId") or "")
    return ""


def requirement_records(requirements: Iterable[Any]) -> list[dict[str, Any]]:
    return [{
        "requirementId": item.id,
        "requirementCode": item.req_id,
        "module": item.module,
        "feature": item.feature,
        "source": item.source or "",
        "risk": item.risk or "中",
        "rule": item.rule or "",
        "question": item.question or "无",
        "clarificationStatus": getattr(item, "clarification_status", "") or default_clarification_status(
            item.question,
            getattr(item, "confirmed", False),
            getattr(item, "clarification_answer", ""),
        ),
        "clarificationAnswer": getattr(item, "clarification_answer", "") or "",
    } for item in requirements]


def requirement_batches(requirements: Iterable[Any]) -> list[str]:
    return _json_batches(requirement_records(requirements))


def test_point_batches(
    points: Iterable[Any],
    requirements_by_id: dict[str, Any],
    environment_context: dict[str, Any] | None = None,
    ui_context_by_environment: dict[str, dict[str, Any]] | None = None,
) -> list[str]:
    records = []
    for point in points:
        requirement = requirements_by_id.get(point.requirement_id)
        record = {
            "testPointId": point.id,
            "testPointCode": getattr(point, "point_code", "") or "",
            "requirementId": point.requirement_id or "",
            "requirementCode": requirement.req_id if requirement else "",
            "requirementFeature": requirement.feature if requirement else "",
            "requirementRule": requirement.rule if requirement else "",
            "module": point.module,
            "type": point.type,
            "title": point.title,
            "description": point.description or "",
            "priority": point.priority or "P1",
            "automatable": bool(point.automatable),
        }
        if environment_context is not None:
            record["testEnvironment"] = environment_context
        # 接入系统识别结果：让用例 title 能引用真实页面/字段/菜单
        if ui_context_by_environment and environment_context:
            env_id = _first_environment_id(environment_context)
            if env_id and env_id in ui_context_by_environment:
                record["recognizedUI"] = _compact_ui_context_for_case(
                    ui_context_by_environment[env_id], point
                )
        records.append(record)
    return _json_batches(records)


def test_case_records(
    cases: Iterable[Any],
    ui_context_by_environment: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    records = []
    for item in cases:
        test_data: Any = item.test_data or ""
        if isinstance(test_data, str) and test_data.strip():
            try:
                test_data = json.loads(test_data)
            except json.JSONDecodeError:
                pass
        record = {
            "testCaseId": item.id,
            "caseCode": item.case_code,
            "requirementId": item.requirement_id or "",
            "testPointId": item.test_point_id or "",
            "module": item.module,
            "feature": item.feature or "",
            "title": item.title,
            "priority": item.priority or "P1",
            "precondition": item.precondition or "无",
            "steps": item.steps or "",
            "testData": test_data,
            "expectedResult": item.expected_result or "",
            "testType": item.test_type or "功能测试",
            "environmentId": item.environment_id or "",
            "targetPlatform": item.target_platform or "PC",
            "testUrl": item.test_url or "",
            "requiredRole": item.required_role or "无",
        }
        if ui_context_by_environment and item.environment_id in ui_context_by_environment:
            record["recognizedUI"] = _compact_ui_context_for_script(
                ui_context_by_environment[item.environment_id],
                item,
            )
        records.append(record)
    return records


def test_case_batches(
    cases: Iterable[Any],
    ui_context_by_environment: dict[str, dict[str, Any]] | None = None,
) -> list[str]:
    records = test_case_records(cases, ui_context_by_environment)
    if ui_context_by_environment is not None:
        records = enrich_script_generation_records(records)
    return _json_batches(
        records,
        max_chars=SCRIPT_BATCH_CHARS,
        max_records=1,
    )


def document_context(
    requirements: Iterable[Any],
    points: Iterable[Any],
    cases: Iterable[Any],
) -> tuple[str, str, str]:
    requirement_list = list(requirements)
    point_list = list(points)
    requirement_map = {item.id: item for item in requirement_list}
    point_records = []
    for payload in test_point_batches(point_list, requirement_map):
        point_records.extend(json.loads(payload))
    return (
        json.dumps(requirement_records(requirement_list), ensure_ascii=False),
        json.dumps(point_records, ensure_ascii=False),
        json.dumps(test_case_records(cases), ensure_ascii=False),
    )


def validate_references(
    items: list[dict[str, Any]],
    field: str,
    allowed_ids: set[str],
    *,
    require_coverage: bool = True,
) -> None:
    returned_ids = [str(item.get(field, "")) for item in items]
    invalid = sorted({item_id for item_id in returned_ids if item_id not in allowed_ids})
    if invalid:
        raise ValueError(f"AI 返回了不属于本批输入的 {field}：{', '.join(invalid[:5])}")
    if require_coverage:
        missing = sorted(allowed_ids - set(returned_ids))
        if missing:
            raise ValueError(f"AI 未覆盖全部输入，缺少 {field}：{', '.join(missing[:5])}")


def validate_reference_values(
    items: list[dict[str, Any]],
    reference_field: str,
    expected_by_id: dict[str, dict[str, Any]],
    fields: tuple[str, ...],
) -> None:
    for item in items:
        reference_id = str(item[reference_field])
        expected = expected_by_id[reference_id]
        for field in fields:
            if item.get(field) != expected.get(field):
                raise ValueError(
                    f"AI 修改了上游字段：{reference_field}={reference_id} 的 {field} "
                    f"应为 {expected.get(field)!r}，实际为 {item.get(field)!r}"
                )


def validate_persisted_traceability(
    points: Iterable[Any] = (),
    cases: Iterable[Any] = (),
) -> None:
    """Reject legacy records that cannot be traced to their upstream source."""
    unlinked_points = [item.id for item in points if not item.requirement_id]
    if unlinked_points:
        raise ValueError("存在未关联需求的旧测试点，请先重新生成测试点")

    unlinked_cases = [
        item.id for item in cases
        if not item.requirement_id or not item.test_point_id
    ]
    if unlinked_cases:
        raise ValueError("存在追溯关系不完整的旧测试用例，请先重新生成测试用例")


def validate_case_environment(items: list[dict[str, Any]], context: dict[str, Any]) -> None:
    target_urls = {item["platform"]: item["url"] for item in context["targets"]}
    target_environment_ids = {
        item["platform"]: item.get("environmentId") or context.get("environmentId")
        for item in context["targets"]
    }
    target_roles = {
        item["platform"]: set(item.get("availableRoles") or context.get("availableRoles") or [])
        for item in context["targets"]
    }
    allowed_roles = set(context.get("availableRoles", [])) | {"无", "待配置"}
    for item in items:
        platform = item["targetPlatform"]
        if platform not in target_urls:
            raise ValueError(f"默认环境未配置 {platform} 测试地址")
        expected_environment_id = target_environment_ids.get(platform)
        if item["environmentId"] != expected_environment_id:
            raise ValueError(f"AI 返回的 {platform} 环境 ID 与默认环境不一致")
        if item["testUrl"] != target_urls[platform]:
            raise ValueError(f"AI 返回的 {platform} 测试地址与环境配置不一致")
        platform_allowed_roles = target_roles.get(platform) or allowed_roles
        if item["requiredRole"] not in (platform_allowed_roles | {"无", "待配置"}):
            raise ValueError(f"AI 返回了环境中不存在的角色：{item['requiredRole']}")


def validate_case_runtime_fields(cases: Iterable[Any], *, for_automation: bool = False) -> None:
    incomplete = [
        item.id for item in cases
        if not item.environment_id or not item.target_platform or not item.test_url or not item.required_role
    ]
    if incomplete:
        raise ValueError("存在未记录测试环境、测试地址或角色的旧测试用例，请先重新生成测试用例")
