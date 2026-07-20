from types import SimpleNamespace

from app.services.script_generation_quality import (
    assert_cases_script_ready,
    generated_script_error_message,
    review_generated_case_automation,
)


def _case(**overrides):
    data = dict(
        id="tc-1",
        case_code="TC_MOD_004",
        module="促销活动管理",
        feature="数据权限",
        title="越权查看非权限范围数据",
        precondition="测试端：PC；所需角色：销售；创建人A的数据需待准备。",
        steps="步骤1: 使用销售角色登录系统。\n步骤2: 进入活动申请列表页面。\n步骤3: 尝试查看创建人A的活动申请数据。",
        test_data="待准备：需准备创建人A的活动数据，以及销售E的登录信息。",
        expected_result="步骤3: 销售应无法查看到创建人A的活动申请数据，列表应不显示A的数据。",
        target_platform="PC",
        test_url="https://dev.example.test/runtime/user/login",
        required_role="销售",
    )
    data.update(overrides)
    return SimpleNamespace(**data)


def test_script_generation_does_not_block_only_because_test_data_is_pending():
    assert_cases_script_ready([_case()])


def test_generated_script_quality_rejects_invented_env_and_generic_locator():
    code = """
import os
from playwright.async_api import expect

async def test_case():
    creator_a_name = os.getenv("TEST_CREATOR_A_NAME")
    table = page.locator("table").first
    await expect(table.locator(f"text={creator_a_name}")).not_to_be_visible()
    print("AITESTLINK_BUSINESS_ASSERTIONS_DONE")
"""

    message = generated_script_error_message(code, _case(test_data='{"creatorAName":"张三"}'))

    assert "系统未配置的环境变量" in message
    assert "TEST_CREATOR_A_NAME" in message
    assert "泛化表格定位 table" in message


def test_generated_script_quality_allows_concrete_business_assertion():
    code = """
from playwright.async_api import expect

async def test_case():
    creator_a_name = "张三"
    list_region = page.locator(".el-table").filter(has_text="活动申请")
    await expect(list_region.locator(f"text={creator_a_name}")).not_to_be_visible()
    print("AITESTLINK_BUSINESS_ASSERTIONS_DONE")
"""

    assert generated_script_error_message(code, _case(test_data='{"creatorAName":"张三"}')) == ""


def test_generated_case_automation_review_keeps_yes_when_only_test_data_pending():
    automation, reason = review_generated_case_automation({
        "title": "越权查看非权限范围数据",
        "precondition": "所需角色：销售",
        "steps": "步骤1: 尝试查看创建人A的活动申请数据",
        "testData": "待准备：需准备创建人A的活动数据",
        "expectedResult": "销售应无法查看到创建人A的数据",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "销售",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "是"
    assert reason == ""


def test_generated_case_automation_review_warns_when_upstream_point_is_not_automatable():
    automation, reason = review_generated_case_automation({
        "title": "登录成功进入首页",
        "precondition": "无",
        "steps": "步骤1: 输入账号密码并登录",
        "testData": "",
        "expectedResult": "页面应进入首页",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "无",
        "automation": True,
    }, point_payload={"automatable": False})

    assert automation == "是"
    assert "自动化复核提醒" in reason
    assert "上游测试点已标记为不适合自动化" in reason


def test_generated_case_automation_review_forces_no_when_role_missing():
    automation, reason = review_generated_case_automation({
        "title": "新增数据",
        "precondition": "需要登录",
        "steps": "步骤1: 新增数据",
        "testData": "",
        "expectedResult": "新增成功",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "待配置",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "否"
    assert "已强制标记为否" in reason
    assert "缺少可执行账号角色" in reason


def test_generated_case_automation_review_keeps_yes_when_data_is_concrete():
    automation, reason = review_generated_case_automation({
        "title": "越权查看非权限范围数据",
        "precondition": "所需角色：销售",
        "steps": "步骤1: 尝试查看创建人A的活动申请数据",
        "testData": {"creatorAName": "张三", "dataScope": "非本人创建的活动申请"},
        "expectedResult": "销售应无法查看到创建人A的数据",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "销售",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "是"
    assert reason == ""
