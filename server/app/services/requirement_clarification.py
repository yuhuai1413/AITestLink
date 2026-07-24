from __future__ import annotations

import re

CLARIFICATION_PENDING = "待确认"
CLARIFICATION_CONFIRMED = "已确认"
CLARIFICATION_NOT_REQUIRED = "无需确认"

CLARIFICATION_STATUSES = {
    CLARIFICATION_PENDING,
    CLARIFICATION_CONFIRMED,
    CLARIFICATION_NOT_REQUIRED,
}

_VAGUE_ANSWER_PATTERNS = (
    "待确认",
    "后续确认",
    "后续补充",
    "看情况",
    "按实际",
    "按实际情况",
    "用户提供",
    "客户提供",
    "暂不明确",
    "不确定",
    "待定",
    "todo",
    "TODO",
)

_EXPLICIT_CONCLUSION_MARKERS = (
    "按", "以", "仅", "不再", "不纳入", "不包含", "统一", "采用", "使用", "归属", "范围", "口径", "处理", "执行", "确认", "纳入", "排除", "开放", "关闭",
)

_NO_QUESTION_VALUES = {
    "",
    "无",
    "暂无",
    "无。",
    "暂无。",
    "无待确认问题",
    "无待确认问题。",
}


def _question_parts(question: str | None) -> list[str]:
    text = (question or "").strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"[\n；;]+", text) if part.strip()]


def is_auxiliary_doc_note(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("【辅助文档信息】") or stripped.startswith("辅助文档信息")


def has_real_clarification_question(question: str | None) -> bool:
    """Return true only when question contains a business clarification item.

    需求解析阶段历史上会把辅助文档里的账号、部门等测试数据也写入 question。
    这类信息不是“待确认问题”，不能阻塞需求评审。
    """
    parts = _question_parts(question)
    if not parts:
        return False
    return any(part not in _NO_QUESTION_VALUES and not is_auxiliary_doc_note(part) for part in parts)


def clarification_answer_quality_issues(question: str | None, answer: str | None) -> list[str]:
    """Return user-facing issues when a clarification answer is still not actionable.

    This is intentionally deterministic. It catches clearly insufficient answers
    early without adding another LLM call to the save/review path.
    """
    real_questions = [part for part in _question_parts(question) if part not in _NO_QUESTION_VALUES and not is_auxiliary_doc_note(part)]
    if not real_questions:
        return []

    normalized_answer = (answer or "").strip()
    if not normalized_answer:
        return ["确认结论为空，请逐条回答待确认问题"]

    lowered_answer = normalized_answer.lower()
    vague_hits = [token for token in _VAGUE_ANSWER_PATTERNS if token.lower() in lowered_answer]
    if vague_hits:
        return [f"确认结论仍包含不明确表述：{', '.join(vague_hits[:3])}"]

    compact_answer = re.sub(r"\s+", "", normalized_answer)
    if len(compact_answer) < max(12, len(real_questions) * 8):
        return ["确认结论过短，无法判断是否已回答清楚待确认问题"]

    has_explicit_conclusion = any(marker in normalized_answer for marker in _EXPLICIT_CONCLUSION_MARKERS)
    if not has_explicit_conclusion and not re.search(r"[。！？.!?；;\n]", normalized_answer):
        return ["确认结论缺少明确表述，请补充结论范围或判断口径"]

    if len(real_questions) >= 2:
        numbered_answer = bool(re.search(r"(^|[\n；;])\s*(\d+|[一二三四五六七八九十]+)[、.．)]", normalized_answer))
        if not numbered_answer and len(compact_answer) < len(real_questions) * 16:
            return ["存在多条待确认问题，请在确认结论中逐条说明"]

    return []


def is_clarification_answer_sufficient(question: str | None, answer: str | None) -> bool:
    return not clarification_answer_quality_issues(question, answer)


def default_clarification_status(
    question: str | None,
    confirmed: bool | None = None,
    answer: str | None = None,
) -> str:
    if not has_real_clarification_question(question):
        return CLARIFICATION_NOT_REQUIRED
    if is_clarification_answer_sufficient(question, answer):
        return CLARIFICATION_CONFIRMED
    return CLARIFICATION_PENDING


def is_clarification_resolved(
    question: str | None,
    status: str | None,
    answer: str | None = None,
) -> bool:
    if not has_real_clarification_question(question):
        return True
    if (status or CLARIFICATION_PENDING) == CLARIFICATION_CONFIRMED:
        return is_clarification_answer_sufficient(question, answer)
    if (status or CLARIFICATION_PENDING) == CLARIFICATION_NOT_REQUIRED:
        return bool((answer or "").strip())
    return False
