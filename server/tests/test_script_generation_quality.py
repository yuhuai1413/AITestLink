from types import SimpleNamespace

from app.services.script_generation_quality import (
    assert_cases_script_ready,
    generated_script_error_message,
    generated_script_warning_message,
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


def test_generated_script_quality_warns_invented_env_and_generic_locator():
    """泛化定位/编造环境变量不再阻断生成，只作为警告提示。"""
    code = """
import os
from playwright.async_api import expect

async def test_case():
    creator_a_name = os.getenv("TEST_CREATOR_A_NAME")
    table = page.locator("table").first
    await expect(table.locator(f"text={creator_a_name}")).not_to_be_visible()
    print("AITESTLINK_BUSINESS_ASSERTIONS_DONE")
"""

    case = _case(test_data='{"creatorAName":"张三"}')

    # 不再阻断保存/执行
    assert generated_script_error_message(code, case) == ""

    # 但应在警告中提示
    warning = generated_script_warning_message(code, case)
    assert "系统未配置的环境变量" in warning
    assert "TEST_CREATOR_A_NAME" in warning
    assert "table" in warning


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


def test_generated_case_automation_review_forces_no_when_test_data_is_unresolved():
    """testData 为字符串型描述且含未落实标记 → 硬否决（依赖外部未控数据）。"""
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

    assert automation == "否"
    assert "已强制标记为否" in reason
    assert "尚未落实的外部测试数据" in reason


def test_generated_case_automation_review_forces_no_when_upstream_point_is_not_automatable():
    """上游测试点不可自动化 → 硬否决（上游结论传导到下游用例）。"""
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

    assert automation == "否"
    assert "已强制标记为否" in reason
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


def test_generated_case_automation_review_forces_no_when_steps_contain_manual_operation():
    """测试步骤含人工操作词 → 硬否决。"""
    automation, reason = review_generated_case_automation({
        "title": "核对报表数据准确性",
        "precondition": "所需角色：财务",
        "steps": "步骤1: 导出报表；步骤2: 人工核对报表金额与台账是否一致",
        "testData": "",
        "expectedResult": "报表金额应与台账一致",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "财务",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "否"
    assert "已强制标记为否" in reason
    assert "人工操作" in reason


def test_generated_case_automation_review_forces_no_for_app_platform():
    """targetPlatform=APP → 硬否决（缺设备与 Appium 服务配置）。"""
    automation, reason = review_generated_case_automation({
        "title": "APP 登录",
        "precondition": "APP 端",
        "steps": "步骤1: 输入账号密码登录",
        "testData": "",
        "expectedResult": "步骤1: 应进入首页",
        "targetPlatform": "APP",
        "testUrl": "https://dev.example.test/app",
        "requiredRole": "销售",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "否"
    assert "已强制标记为否" in reason
    assert "APP 端自动化" in reason


def test_generated_case_automation_review_forces_no_when_expected_result_is_subjective():
    """预期结果含主观感受词 → 硬否决。"""
    automation, reason = review_generated_case_automation({
        "title": "首页展示效果验证",
        "precondition": "所需角色：运营",
        "steps": "步骤1: 打开首页查看 banner",
        "testData": "",
        "expectedResult": "步骤1: banner 看起来美观，颜色搭配协调",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "运营",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "否"
    assert "已强制标记为否" in reason
    assert "人工主观判断" in reason


def test_generated_case_automation_review_keeps_yes_for_clean_pc_case():
    """正常 PC 用例 + 客观断言 + 结构化数据 → 仍判「是」（防回归）。"""
    automation, reason = review_generated_case_automation({
        "title": "新增报价单",
        "precondition": "所需角色：销售；PC 端",
        "steps": "步骤1: 点击新增按钮；步骤2: 填写报价单表单；步骤3: 点击保存",
        "testData": {"customerName": "测试客户A", "amount": "1000"},
        "expectedResult": "步骤3: 列表应出现新增的报价单记录，金额显示为 1000",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "销售",
        "automation": True,
    }, point_payload={"automatable": True})

    assert automation == "是"
    assert reason == ""


def test_generated_case_automation_review_respects_ai_no_when_no_hard_block():
    """无硬伤时，AI 判 false 则最终为「否」（采纳 AI 初判的否定）。"""
    automation, reason = review_generated_case_automation({
        "title": "新增报价单",
        "precondition": "所需角色：销售",
        "steps": "步骤1: 点击新增按钮；步骤2: 保存",
        "testData": "",
        "expectedResult": "步骤2: 应保存成功",
        "targetPlatform": "PC",
        "testUrl": "https://dev.example.test",
        "requiredRole": "销售",
        "automation": False,
    }, point_payload={"automatable": True})

    assert automation == "否"
    assert reason == ""
