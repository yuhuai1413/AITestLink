from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from typing import Any


COMMON_WORDS = {
    "测试", "验证", "页面", "系统", "功能", "成功", "失败", "显示", "进入", "点击",
    "进行", "支持", "能够", "用户", "操作", "信息", "检查", "应当", "是否", "查看",
    "登录", "账号", "密码", "验证码", "CRM", "PC", "APP", "环境", "角色", "步骤",
    "结果", "预期", "数据", "正确", "不同", "状态", "当前", "业务", "列表",
}


@dataclass
class ScriptCoverageResult:
    ok: bool
    error: str = ""
    evidence: str = ""


def validate_script_covers_test_case(code: str, test_case: Any) -> ScriptCoverageResult:
    """Reject scripts that can pass after login without testing the business case."""
    if not code.strip():
        return ScriptCoverageResult(False, "脚本代码为空")

    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return ScriptCoverageResult(False, f"脚本语法错误：{exc}")

    if not _has_real_assertion(tree):
        return ScriptCoverageResult(
            False,
            "脚本没有真实断言。登录成功或脚本正常退出不能代表测试通过，必须使用 expect/assert 验证业务预期。",
        )

    case_text = _case_text(test_case)
    keywords = _business_keywords(test_case)
    if not keywords:
        return ScriptCoverageResult(True, evidence="未提取到明确业务关键词，仅校验真实断言")

    executable_text = _executable_string_text(tree)
    matched = [keyword for keyword in keywords if keyword in executable_text]
    reverse_matched = [
        keyword for keyword in _business_keywords_from_text(executable_text)
        if keyword in case_text and keyword not in matched
    ]
    matched.extend(reverse_matched)
    required = 1 if len(keywords) <= 2 else 2
    if len(matched) < required:
        return ScriptCoverageResult(
            False,
            (
                "脚本没有覆盖测试用例的业务目标。当前脚本可能只完成了登录或通用跳转，"
                f"但未在可执行定位/断言中体现关键业务点：{', '.join(keywords[:8])}。"
            ),
        )

    return ScriptCoverageResult(True, evidence=f"覆盖业务关键词：{', '.join(matched[:8])}")


def _has_real_assertion(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Assert):
            return True
        if isinstance(node, ast.Call) and _call_name(node.func) in {"expect", "pytest.fail"}:
            return True
        if isinstance(node, ast.Raise):
            return True
    return False


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _call_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""


def _executable_string_text(tree: ast.Module) -> str:
    values: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            values.append(node.value)
        elif isinstance(node, ast.JoinedStr):
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    values.append(value.value)
    return "\n".join(values)


def _business_keywords(test_case: Any) -> list[str]:
    return _business_keywords_from_text(_case_text(test_case))


def _case_text(test_case: Any) -> str:
    return " ".join(
        str(value or "")
        for value in (
            getattr(test_case, "module", ""),
            getattr(test_case, "feature", ""),
            getattr(test_case, "title", ""),
            getattr(test_case, "steps", ""),
            getattr(test_case, "expected_result", ""),
        )
    )


def _business_keywords_from_text(text: str) -> list[str]:
    words = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z0-9_-]{2,}", text)
    keywords: list[str] = []
    for word in words:
        normalized = word.strip()
        if not normalized or normalized in COMMON_WORDS:
            continue
        normalized = _trim_common_affixes(normalized)
        if not normalized or normalized in COMMON_WORDS:
            continue
        if normalized not in keywords:
            keywords.append(normalized)
    return keywords[:16]


def _trim_common_affixes(value: str) -> str:
    prefixes = (
        "查看页面是否显示", "页面应显示", "页面应拒绝访问或不显示", "尝试访问",
        "访问", "打开", "进入", "查看", "是否显示", "应显示", "不显示",
    )
    suffixes = ("菜单项", "菜单页", "模块", "页面")
    normalized = value
    for prefix in prefixes:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):]
            break
    for suffix in suffixes:
        if normalized.endswith(suffix) and len(normalized) > len(suffix) + 1:
            normalized = normalized[: -len(suffix)]
            break
    return normalized.strip("，。、；：,. ")
