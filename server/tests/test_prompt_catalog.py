from app.prompts.prompt_catalog import PROMPT_CATALOG


def test_parse_requirements_prompt_uses_image_facts_before_questions():
    prompt = PROMPT_CATALOG["parse-requirements"]

    assert "图片识别结果与正文、表格互相补充" in prompt
    assert "就应写入 rule，不要再写入 question" in prompt
    assert "不要为了“保险”生成泛化待确认问题" in prompt
    assert "仍缺任一关键项时才写入 question" in prompt

