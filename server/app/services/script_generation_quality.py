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
    # 脚本内部约定的业务断言完成标记，不是外部环境变量
    "AITESTLINK_BUSINESS_ASSERTIONS_DONE",
}

GENERIC_LOCATOR_PATTERNS = (
    (re.compile(r"locator\(\s*['\"]table['\"]\s*\)"), "使用了泛化的 table 定位，可能点不到目标列表"),
    (re.compile(r"\[class\*=[\"']menu-item[\"']\]"), "使用了泛化的菜单定位，可能点错菜单"),
    (re.compile(r"\[class\*=[\"']option[\"']\]"), "使用了泛化的下拉项定位，可能选错选项"),
)

DATA_DEPENDENT_TOKENS = (
    "创建人A", "用户A", "部门A", "人员A", "账号A", "非权限范围", "越权",
    "无权限", "已上传文件", "指定文件", "指定部门", "指定用户",
)

# 预期结果含这些词 → 无法用代码客观断言，硬否决自动化。
SUBJECTIVE_TOKENS = (
    "是否合理", "是否美观", "体验", "人工判断", "人工确认", "人工核对",
    "视觉效果", "易用性",
    # UI / 视觉 / 主观感受类（扩展）
    "看起来", "感觉", "大致", "基本一致", "颜色搭配", "排版", "美观度",
    "协调", "舒适", "清晰度", "是否符合设计", "肉眼", "目测",
    "是否符合预期", "是否正确", "是否正常", "是否合适", "是否得当",
    "观感", "样式是否", "布局是否",
)

# 测试步骤含这些词 → 需要人工介入操作，无法纯脚本执行，硬否决自动化。
MANUAL_OPERATION_TOKENS = (
    "人工核对", "人工确认", "人工检查", "人工审核", "人工审批",
    "肉眼检查", "肉眼核对", "目测检查",
    "电话确认", "电话联系", "电话核实",
    "线下操作", "线下办理", "线下确认",
    "主管审批", "领导审批", "上级审批",
    "邮件确认", "邮件通知", "短信确认",
    "纸质", "签字", "签名", "盖章",
    "当面", "口头", "现场",
)

# testData 文本含这些词 → 依赖尚未落实的外部数据，硬否决自动化。
# 仅当 testData 是字符串型描述时触发；结构化具体值（如 {"name":"张三"}）不受影响。
EXTERNAL_DATA_TOKENS = (
    "待准备", "待确认", "待补充", "待提供", "待生成", "待创建",
    "尚未确定", "尚未提供", "尚未准备",
    "指定用户", "指定文件", "指定部门", "指定数据",
    "某特定", "某个特定", "特定的",
    "需准备", "需确认", "需提供", "需补充",
    "TBD", "TODO",
)


# 问题分级：硬性错误会阻止脚本保存/执行；警告只提示，不阻断流程。
# 只保留真正无法运行的问题为「错误」，其余一律降为「警告」。
_HARD_ERRORS: set[str] = {"empty_code", "syntax"}

# ── 问题类型 → 用户可操作的解决路径（面向非技术用户的人话）──
_ISSUE_HINTS: dict[str, str] = {
    # 用例级（生成前校验）
    "missing_url": "去「测试用例」里编辑这条用例，把被测系统的网址（Web 测试地址）填上",
    "missing_role": "去「测试用例」里编辑这条用例，选择用哪个账号角色来执行",
    # 脚本级（生成后校验）
    "empty_code": "脚本内容为空，请重新生成",
    "syntax": "脚本有语法错误，请重新生成，或点「编辑」手动改对后保存",
    "invented_env": "脚本用到了系统里还没配置的测试数据。去「环境配置」补上对应账号/数据后重新执行即可，不影响保存",
    "generic_locator": "脚本用了比较模糊的元素定位（比如直接找表格）。通常仍能运行，如果跑的时候点错了位置，去「需求列表」把目标按钮/栏位的名称写具体些，再重新生成",
    "unresolved_assumption": "脚本里留了待确认的假设。可以先试跑，跑不通的话去「需求列表」补充确认结论后重新生成",
    "unresolved_business_object": "需求里提到的业务数据（如某个具体用户/文件）还没落实成可执行数据。去「需求确认结论」里写明具体值后重新生成",
    "missing_assertion": "脚本没有结果校验语句，能跑但无法自动判断对错。建议重新生成；如急需可先保存手动核对",
    "missing_business_done": "脚本缺少业务完成的结束标记。能运行，建议重新生成让结果更可靠；如急需可先保存",
}



@dataclass
class QualityIssue:
    type: str
    message: str
    case_label: str = ""


@dataclass
class QualityReport:
    ok: bool
    issues: list[QualityIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[QualityIssue]:
        """硬性错误：必须解决才能保存/执行。"""
        return [i for i in self.issues if i.type in _HARD_ERRORS]

    @property
    def warnings(self) -> list[QualityIssue]:
        """警告：只提示，不阻断流程。"""
        return [i for i in self.issues if i.type not in _HARD_ERRORS]

    def user_message(self, *, title: str = "当前脚本无法可靠执行", warnings_only: bool = False) -> str:
        shown = self.warnings if warnings_only else self.errors
        if not shown:
            return ""
        lines = [title, ""]
        for issue in shown[:8]:
            hint = _ISSUE_HINTS.get(issue.type, "")
            lines.append(f"• {issue.message}")
            if hint:
                lines.append(f"  → {hint}")
        if len(shown) > 8:
            lines.append(f"  （还有 {len(shown) - 8} 个问题未列出）")
        return "\n".join(lines)


def analyze_case_script_readiness(test_case: Any) -> QualityReport:
    """Check whether a reviewed automatable case is ready for script generation."""
    issues: list[QualityIssue] = []
    title = getattr(test_case, "title", "") or ""
    case_code = getattr(test_case, "case_code", "") or "未编号用例"
    label = f"{case_code}「{title}」"
    text = _case_text(test_case)
    if (getattr(test_case, "target_platform", "") or "PC") == "PC":
        if not getattr(test_case, "test_url", ""):
            issues.append(QualityIssue("missing_url", f"{label}缺少 Web 测试地址", case_label=label))
        required_role = getattr(test_case, "required_role", "") or ""
        if not required_role or required_role == "待配置":
            issues.append(QualityIssue("missing_role", f"{label}缺少可执行账号角色", case_label=label))

    return QualityReport(ok=not issues, issues=issues)


def review_generated_case_automation(
    case_payload: dict[str, Any],
    *,
    point_payload: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Return final automation value and deterministic review reason.

    AI provides the first-pass automation flag, but backend rules make the
    final persisted decision. Any single hard-block rule forces ``"否"`` so
    that downstream script generation only picks up cases that can really run.
    """
    ai_value = _normalize_automation_flag(case_payload.get("automation"))
    hard_reasons: list[str] = []

    steps_text = str(case_payload.get("steps") or "")
    expected_text = str(case_payload.get("expectedResult") or "")
    test_data = case_payload.get("testData")
    # testData 可能是结构化具体值（dict/list，如 {"name":"张三"}，可自动化），
    # 也可能是字符串型描述。只有字符串型才检查是否含"未落实"标记。
    test_data_text = test_data if isinstance(test_data, str) else ""

    # 规则1：上游测试点已认定不可自动化 → 硬否决（上游结论应传导到下游用例）
    if point_payload is not None and point_payload.get("automatable") is False:
        hard_reasons.append("上游测试点已标记为不适合自动化")

    # 规则2：APP 端 → 硬否决。当前环境配置未存储 Appium 服务地址、设备名等
    # APP 自动化必需信息，APP 用例无法真正执行。
    if str(case_payload.get("targetPlatform") or "").upper() == "APP":
        hard_reasons.append("APP 端自动化缺少设备与 Appium 服务配置，当前无法执行")

    # 规则3：缺测试地址或测试端
    if not case_payload.get("testUrl") or not case_payload.get("targetPlatform"):
        hard_reasons.append("缺少测试地址或测试端")

    # 规则4：缺可执行账号角色
    required_role = str(case_payload.get("requiredRole") or "").strip()
    if not required_role or required_role == "待配置":
        hard_reasons.append("缺少可执行账号角色")

    # 规则5：测试步骤含人工操作词 → 无法纯脚本执行
    manual_hits = [t for t in MANUAL_OPERATION_TOKENS if t in steps_text]
    if manual_hits:
        hard_reasons.append(f"测试步骤含人工操作（{manual_hits[0]}），无法自动化执行")

    # 规则6：预期结果依赖人工主观判断 → 无法稳定自动断言
    subjective_hits = [t for t in SUBJECTIVE_TOKENS if t in expected_text]
    if subjective_hits:
        hard_reasons.append(f"预期结果依赖人工主观判断（{subjective_hits[0]}），无法稳定自动断言")

    # 规则7：testData 为字符串型描述且含未落实标记 → 依赖外部未控数据
    if test_data_text:
        external_hits = [t for t in EXTERNAL_DATA_TOKENS if t in test_data_text]
        if external_hits:
            hard_reasons.append(f"依赖尚未落实的外部测试数据（{external_hits[0]}）")

    if hard_reasons:
        return "否", "自动化复核：已强制标记为否；原因：" + "；".join(hard_reasons[:6])
    return ("是" if ai_value else "否"), ""


def assert_cases_script_ready(cases: Iterable[Any]) -> None:
    issues: list[QualityIssue] = []
    for case in cases:
        report = analyze_case_script_readiness(case)
        issues.extend(report.issues)
    if not issues:
        return
    # 按用例分组，避免一股脑平铺所有问题
    grouped: dict[str, list[QualityIssue]] = {}
    for issue in issues:
        label = issue.case_label or "未知用例"
        grouped.setdefault(label, []).append(issue)
    lines = ["自动化脚本生成已停止", ""]
    for case_label, case_issues in grouped.items():
        lines.append(f"• {case_label}")
        for ci in case_issues:
            hint = _ISSUE_HINTS.get(ci.type, "")
            lines.append(f"  × {ci.message.split('」')[-1] if '」' in ci.message else ci.message}")
            if hint:
                lines.append(f"    → {hint}")
    total = len(grouped)
    lines.append("")
    lines.append(f"共 {total} 个用例存在问题，请补充上述信息后重新生成。")
    raise ValueError("\n".join(lines))


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

    # 只有硬性错误才判定为不可用；警告类问题不阻断
    has_hard_error = any(i.type in _HARD_ERRORS for i in issues)
    return QualityReport(ok=not has_hard_error, issues=issues)


def generated_script_error_message(code: str, test_case: Any) -> str:
    """硬性错误信息：只在脚本真的无法保存/执行时返回非空，用于阻断流程。"""
    report = validate_generated_script_quality(code, test_case)
    return "" if not report.errors else report.user_message(title="脚本无法保存，请先修复以下问题")


def generated_script_warning_message(code: str, test_case: Any) -> str:
    """警告信息：脚本可以保存和执行，但存在可能影响可靠性的提示。不阻断流程。"""
    report = validate_generated_script_quality(code, test_case)
    return "" if not report.warnings else report.user_message(
        title="脚本已生成，以下提示可能影响执行可靠性（不影响保存）",
        warnings_only=True,
    )


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
