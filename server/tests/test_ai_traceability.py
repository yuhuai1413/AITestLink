import json
from types import SimpleNamespace

import pytest

from app.services.ai_input_builder import (
    document_context,
    requirement_batches,
    test_case_batches as build_test_case_batches,
    test_point_batches as build_test_point_batches,
    validate_case_environment,
    validate_persisted_traceability,
    validate_reference_values,
    validate_references,
)


def _requirement(identifier: str = "req-1") -> SimpleNamespace:
    return SimpleNamespace(
        id=identifier,
        req_id="REQ_001",
        module="登录",
        feature="账号登录",
        source="requirements.md",
        risk="高",
        rule="正确凭据登录成功",
        question="无",
    )


def _point(identifier: str = "tp-1", requirement_id: str | None = "req-1") -> SimpleNamespace:
    return SimpleNamespace(
        id=identifier,
        point_code="TP_LOGIN_001",
        requirement_id=requirement_id,
        module="登录",
        type="正常流程",
        title="正确凭据登录",
        description="输入正确凭据并验证进入首页",
        priority="P0",
        automatable=True,
    )


def _case(
    identifier: str = "tc-1",
    requirement_id: str | None = "req-1",
    test_point_id: str | None = "tp-1",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=identifier,
        case_code="TC_LOGIN_001",
        requirement_id=requirement_id,
        test_point_id=test_point_id,
        module="登录",
        feature="账号登录",
        title="正确凭据登录",
        priority="P0",
        precondition="账号已准备",
        steps="步骤1: 登录",
        test_data='{"usernameEnv":"TEST_USERNAME"}',
        expected_result="步骤1: 应进入首页",
        test_type="功能测试",
        environment_id="env-1",
        target_platform="PC",
        test_url="https://test.example.com",
        required_role="管理员",
    )


def test_each_ai_stage_receives_persisted_upstream_ids():
    requirement = _requirement()
    point = _point()
    case = _case()

    requirement_input = json.loads(requirement_batches([requirement])[0])[0]
    point_input = json.loads(build_test_point_batches([point], {requirement.id: requirement})[0])[0]
    case_input = json.loads(build_test_case_batches([case])[0])[0]

    assert requirement_input["requirementId"] == requirement.id
    assert point_input["testPointId"] == point.id
    assert point_input["testPointCode"] == point.point_code
    assert point_input["requirementId"] == requirement.id
    assert case_input["testCaseId"] == case.id
    assert case_input["testPointId"] == point.id
    assert case_input["requirementId"] == requirement.id
    assert case_input["testData"] == {"usernameEnv": "TEST_USERNAME"}
    assert case_input["testUrl"] == "https://test.example.com"
    assert case_input["requiredRole"] == "管理员"


def test_reference_validation_rejects_unknown_and_missing_ids():
    with pytest.raises(ValueError, match="不属于本批输入"):
        validate_references([{"requirementId": "req-unknown"}], "requirementId", {"req-1"})

    with pytest.raises(ValueError, match="未覆盖全部输入"):
        validate_references([{"requirementId": "req-1"}], "requirementId", {"req-1", "req-2"})


def test_reference_validation_rejects_mutated_upstream_values():
    with pytest.raises(ValueError, match="修改了上游字段"):
        validate_reference_values(
            [{"testPointId": "tp-1", "module": "订单", "priority": "P0"}],
            "testPointId",
            {"tp-1": {"module": "登录", "priority": "P0"}},
            ("module", "priority"),
        )


def test_case_environment_rejects_changed_url_and_role():
    context = {
        "environmentId": "env-1",
        "targets": [
            {"platform": "PC", "url": "https://pc.example.test"},
            {"platform": "APP", "url": "app://test-build"},
        ],
        "availableRoles": ["管理员"],
    }
    with pytest.raises(ValueError, match="地址与环境配置不一致"):
        validate_case_environment([{
            "environmentId": "env-1", "targetPlatform": "PC",
            "testUrl": "https://invented.example", "requiredRole": "管理员",
            "automation": False,
        }], context)
    with pytest.raises(ValueError, match="不存在的角色"):
        validate_case_environment([{
            "environmentId": "env-1", "targetPlatform": "PC",
            "testUrl": "https://pc.example.test", "requiredRole": "超级管理员",
            "automation": False,
        }], context)


def test_legacy_unlinked_records_are_rejected_before_downstream_generation():
    with pytest.raises(ValueError, match="未关联需求"):
        validate_persisted_traceability([_point(requirement_id=None)])

    with pytest.raises(ValueError, match="追溯关系不完整"):
        validate_persisted_traceability(cases=[_case(test_point_id=None)])


def test_document_context_keeps_complete_traceability_chain():
    requirement = _requirement()
    point = _point()
    case = _case()
    requirements_json, points_json, cases_json = document_context(
        [requirement], [point], [case]
    )

    assert json.loads(requirements_json)[0]["requirementId"] == requirement.id
    assert json.loads(points_json)[0]["requirementId"] == requirement.id
    assert json.loads(cases_json)[0]["testPointId"] == point.id
