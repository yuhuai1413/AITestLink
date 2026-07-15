import pytest

from app.schemas.ai_output import output_json_schema, validate_ai_output
from app.services.llm_client import json_schema_response_format, supports_json_schema


def test_requirement_output_rejects_unknown_table_fields():
    with pytest.raises(ValueError, match="结构校验失败"):
        validate_ai_output("需求解析", [{
            "module": "登录",
            "feature": "账号登录",
            "unexpectedColumn": "不会被静默写入",
        }])


def test_test_point_output_normalizes_supported_values():
    result = validate_ai_output("测试点生成", [{
        "requirementId": "req-1",
        "module": "登录",
        "type": "正常流程",
        "title": "正确账号登录",
        "priority": "p0",
        "automatable": "是",
    }])
    assert result[0]["priority"] == "P0"
    assert result[0]["automatable"] is True


def test_test_case_output_rejects_missing_required_field():
    with pytest.raises(ValueError, match="title"):
        validate_ai_output("用例生成", [{"testPointId": "tp-1", "module": "登录"}])


def test_structured_output_schema_is_array_contract():
    schema = output_json_schema("测试点生成")
    assert schema["type"] == "array"
    assert schema["minItems"] == 1
    assert schema["items"]["additionalProperties"] is False


def test_json_schema_is_enabled_only_for_known_supported_endpoints():
    schema = output_json_schema("需求解析")
    assert supports_json_schema("https://api.openai.com/v1") is True
    assert supports_json_schema("https://example.openai.azure.com/openai/deployments/x") is True
    assert supports_json_schema("https://custom-provider.example/v1") is False
    response_format = json_schema_response_format("需求解析", schema)
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["strict"] is True


def test_execution_report_rejects_invented_statistics_and_defect_links():
    payload = {
        "summary": {"total": 2, "passed": 1, "failed": 0, "timeout": 0, "skipped": 0},
        "executionDetails": [{
            "scriptId": "script-1",
            "testCaseId": "case-1",
            "environmentId": "env-1",
            "status": "passed",
            "durationSeconds": 1.2,
            "failureType": "无",
            "errorInfo": "",
            "evidence": "trace.zip",
        }],
        "defects": [{
            "testCaseId": "case-invented",
            "severity": "P1",
            "title": "未知缺陷",
            "evidence": "日志",
            "expected": "成功",
            "actual": "失败",
        }],
        "scriptIssues": [],
        "environmentIssues": [],
        "recommendations": [],
    }
    with pytest.raises(ValueError, match="summary.total"):
        validate_ai_output("执行脚本", payload)
