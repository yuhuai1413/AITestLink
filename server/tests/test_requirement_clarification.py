from app.services.requirement_clarification import (
    CLARIFICATION_CONFIRMED,
    clarification_answer_quality_issues,
    default_clarification_status,
    is_clarification_answer_sufficient,
)


def test_clear_answer_does_not_need_to_repeat_question_keywords():
    question = "请确认业务对象的范围和判断口径"
    answer = "本次只测已登录销售主管能看到自己负责的记录，其他人员不纳入本轮。"

    assert clarification_answer_quality_issues(question, answer) == []
    assert is_clarification_answer_sufficient(question, answer) is True
    assert default_clarification_status(question, answer=answer) == CLARIFICATION_CONFIRMED


def test_vague_placeholder_answer_is_still_rejected():
    issues = clarification_answer_quality_issues("请确认部门需求是否只覆盖销售部", "后续确认")

    assert issues
    assert "不明确表述" in issues[0]
