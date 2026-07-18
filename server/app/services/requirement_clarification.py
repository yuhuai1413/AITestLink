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


def default_clarification_status(
    question: str | None,
    confirmed: bool | None = None,
    answer: str | None = None,
) -> str:
    if not has_real_clarification_question(question):
        return CLARIFICATION_NOT_REQUIRED
    if (answer or "").strip():
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
        return True
    if (status or CLARIFICATION_PENDING) == CLARIFICATION_NOT_REQUIRED:
        return bool((answer or "").strip())
    return False
