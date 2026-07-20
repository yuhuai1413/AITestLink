from __future__ import annotations

import ast
import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable


KNOWN_RUNTIME_ENVS = {
    "WEB_BASE_URL",
    "APP_BASE_URL",
    "BASE_URL",
    "TEST_BASE_URL",
    "TEST_USERNAME",
    "TEST_PASSWORD",
    "TEST_ACCOUNT_ROLE",
    "TEST_LOGIN_CAPTCHA_REQUIRED",
    "TEST_LOGIN_CAPTCHA_CODE",
    "TEST_TIMEOUT",
    "TEST_TIMEOUT_MS",
    "PLAYWRIGHT_HEADLESS",
    "TEST_HEADLESS",
    "TEST_SLOW_MO",
    "APPIUM_SERVER_URL",
}

GENERIC_LOCATOR_PATTERNS = (
    (re.compile(r"locator\(\s*['\"]table['\"]\s*\)"), "使用了泛化表格定位 table，无法确认定位到目标业务列表"),
    (re.compile(r"\[class\*=[\"']menu-item[\"']\]"), "使用了泛化菜单定位 [class*=\"menu-item\"]，容易点错菜单"),
    (re.compile(r"\[class\*=[\"']option[\"']\]"), "使用了泛化选项定位 [class*=\"option\"]，容易选错下拉项"),
)

DATA_DEPENDENT_TOKENS = (
    "创建人A", "用户A", "部门A", "人员A", "账号A", "非权限范围", "越权",
    "无权限", "已上传文件", "指定文件", "指定部门", "指定用户",
)
SUBJECTIVE_TOKENS = ("是否合理", "是否美观", "体验", "人工判断", "人工确认", "视觉效果", "易用性")


@dataclass
class QualityIssue:
    type: str
    message: str


@dataclass
class QualityReport:
    ok: bool
    issues: list[QualityIssue] = field(default_factory=list)

    def user_message(self, *, title: str = "当前脚本无法可靠执行") -> str:
        if self.ok:
            return ""
        lines = [title, "", "发现的问题："]
        for index, issue in enumerate(self.issues[:8], 1):
            lines.append(f"{index}. {issue.message}")
        lines.extend(["", "建议处理：回到需求列表补充待确认问题的确认结论，或重新进行系统识别后，再重新生成自动化脚本。"])
        return "\n".join(lines)


def analyze_case_script_readiness(test_case: Any) -> QualityReport:
    """Check whether a reviewed automatable case is ready for script generation."""
    issues: list[QualityIssue] = []
    title = getattr(test_case, "title", "") or ""
    case_code = getattr(test_case, "case_code", "") or "未编号用例"
    text = _case_text(test_case)
    if (getattr(test_case, "target_platform", "") or "PC") == "PC":
        if not getattr(test_case, "test_url", ""):
            issues.append(QualityIssue("missing_url", f"{case_code}「{title}」缺少 Web 测试地址"))
        required_role = getattr(test_case, "required_role", "") or ""
        if not required_role or required_role == "待配置":
            issues.append(QualityIssue("missing_role", f"{case_code}「{title}」缺少可执行账号角色"))

    return QualityReport(ok=not issues, issues=issues)


def review_generated_case_automation(
    case_payload: dict[str, Any],
    *,
    point_payload: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Return final automation value and deterministic review reason.

    AI provides the first-pass automation flag, but backend rules make the
    final persisted decision for cases that are clearly not executable.
    """
    ai_value = _normalize_automation_flag(case_payload.get("automation"))
    hard_reasons: list[str] = []
    warnings: list[str] = []
    text = " ".join(
        str(case_payload.get(key) or "")
        for key in ("title", "precondition", "steps", "testData", "expectedResult")
    )
    if point_payload is not None and point_payload.get("automatable") is False:
        warnings.append("上游测试点已标记为不适合自动化，请人工复核")

    if not case_payload.get("testUrl") or not case_payload.get("targetPlatform"):
        hard_reasons.append("缺少测试地址或测试端")

    required_role = str(case_payload.get("requiredRole") or "").strip()
    if not required_role or required_role == "待配置":
        hard_reasons.append("缺少可执行账号角色")

    if any(token in text for token in SUBJECTIVE_TOKENS):
        hard_reasons.append("预期结果依赖人工主观判断，无法稳定自动断言")

    if hard_reasons:
        return "否", "自动化复核：已强制标记为否；原因：" + "；".join(hard_reasons[:6])
    if warnings:
        final_value = "是" if ai_value else "否"
        return final_value, "自动化复核提醒：" + "；".join(warnings[:6])
    return ("是" if ai_value else "否"), ""


def assert_cases_script_ready(cases: Iterable[Any]) -> None:
    issues: list[QualityIssue] = []
    for case in cases:
        report = analyze_case_script_readiness(case)
        issues.extend(report.issues)
    if issues:
        raise ValueError(QualityReport(False, issues).user_message(title="自动化脚本生成已停止：存在不可执行的测试用例"))


def validate_generated_script_quality(code: str, test_case: Any) -> QualityReport:
    """Validate AI-generated script before saving/executing it."""
    issues: list[QualityIssue] = []
    if not code.strip():
        return QualityReport(False, [QualityIssue("empty_code", "脚本代码为空")])

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return QualityReport(False, [QualityIssue("syntax", f"脚本存在 Python 语法错误：{exc}")])

    invented_envs = sorted(_env_names(code) - KNOWN_RUNTIME_ENVS)
    if invented_envs:
        issues.append(QualityIssue(
            "invented_env",
            f"脚本使用了系统未配置的环境变量：{', '.join(invented_envs[:6])}",
        ))

    generic = [message for pattern, message in GENERIC_LOCATOR_PATTERNS if pattern.search(code)]
    for message in generic[:4]:
        issues.append(QualityIssue("generic_locator", message))

    lowered = code.lower()
    if any(token in lowered for token in ("missing locator information", "assume", "假设", "todo", "缺乏详细定位信息")):
        issues.append(QualityIssue("unresolved_assumption", "脚本中仍存在未解决的假设、TODO 或缺少定位信息说明"))

    text = _case_text(test_case)
    if any(token in text for token in DATA_DEPENDENT_TOKENS):
        if "TEST_CREATOR_A_NAME" in code:
            issues.append(QualityIssue(
            "unresolved_business_object",
            "脚本发明了创建人A环境变量，说明需求中的业务对象没有被正确转成可执行步骤",
            ))

    if not _has_business_assertion(tree):
        issues.append(QualityIssue("missing_assertion", "脚本没有可验证业务预期的 expect/assert 断言"))

    if "AITESTLINK_BUSINESS_ASSERTIONS_DONE" not in code:
        issues.append(QualityIssue("missing_business_done", "脚本缺少业务断言完成标记，无法区分登录成功和业务测试通过"))

    return QualityReport(ok=not issues, issues=issues)


def generated_script_error_message(code: str, test_case: Any) -> str:
    report = validate_generated_script_quality(code, test_case)
    return "" if report.ok else report.user_message(title="脚本生成质量不满足执行要求")


def enrich_script_generation_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for item in records:
        data_requirements = _data_requirements_from_text(
            " ".join(str(item.get(key) or "") for key in ("title", "precondition", "steps", "testData", "expectedResult"))
        )
        copy = dict(item)
        copy["executionReadiness"] = {
            "knownRuntimeEnvs": sorted(KNOWN_RUNTIME_ENVS),
            "requiredBusinessData": data_requirements,
            "rule": "requiredBusinessData 中的数据必须来自需求确认结论、环境配置、账号或系统识别；缺失时不得编造环境变量或定位器。",
        }
        enriched.append(copy)
    return enriched


def _normalize_automation_flag(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"是", "适合", "true", "yes", "1"}


def _case_text(test_case: Any) -> str:
    return " ".join(
        str(value or "")
        for value in (
            getattr(test_case, "module", ""),
            getattr(test_case, "feature", ""),
            getattr(test_case, "title", ""),
            getattr(test_case, "precondition", ""),
            getattr(test_case, "steps", ""),
            getattr(test_case, "test_data", ""),
            getattr(test_case, "expected_result", ""),
        )
    )


def _missing_data_labels(text: str) -> list[str]:
    labels: list[str] = []
    mapping = {
        "创建人A": "创建人A",
        "用户A": "用户A",
        "部门A": "部门A",
        "非权限范围": "非权限范围数据",
        "越权": "越权验证数据",
        "已上传文件": "已上传文件",
        "指定文件": "指定文件",
    }
    for token, label in mapping.items():
        if token in text and label not in labels:
            labels.append(label)
    return labels or ["业务测试数据"]


def _data_requirements_from_text(text: str) -> list[str]:
    return _missing_data_labels(text) if any(token in text for token in DATA_DEPENDENT_TOKENS) else []


def _env_names(code: str) -> set[str]:
    names = set(re.findall(r"os\.getenv\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]", code))
    names.update(re.findall(r"os\.environ(?:\.get)?\(\s*['\"]([A-Z][A-Z0-9_]+)['\"]", code))
    names.update(re.findall(r"os\.environ\[\s*['\"]([A-Z][A-Z0-9_]+)['\"]\s*\]", code))
    return names


def _has_business_assertion(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Assert):
            return True
        if isinstance(node, ast.Call):
            name = _call_name(node.func)
            if name == "expect" or name.startswith("expect."):
                return True
            if name.endswith(".to_be_visible") or name.endswith(".not_to_be_visible"):
                return True
    return False


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _call_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""
