import asyncio

from app.services.script_runner import LocalScriptRunner


def _run(code: str, *, variables=None, headed=False, slow_mo_ms=0):
    return asyncio.run(LocalScriptRunner().run_python(
        code=code,
        variables=variables or {},
        timeout_seconds=5,
        headed=headed,
        slow_mo_ms=slow_mo_ms,
    ))


def test_runner_calls_async_test_function_without_explicit_entry():
    result = _run("""
async def test_case():
    print("actual test body")
""")

    assert result.status == "通过"
    assert "AITESTLINK_TEST_ENTRY_START:test_case" in result.output
    assert "actual test body" in result.output


def test_runner_fails_import_only_script_without_entry():
    result = _run("""
import os
from pathlib import Path
""")

    assert result.status == "失败"
    assert "没有可执行入口" in result.error


def test_runner_surfaces_runtime_error_from_wrapped_entry():
    result = _run("""
async def test_case():
    raise RuntimeError("missing locator")
""")

    assert result.status == "失败"
    assert "missing locator" in result.error


def test_runner_injects_visual_execution_environment():
    result = _run("""
import os

def test_case():
    print(os.getenv("PLAYWRIGHT_HEADLESS"))
    print(os.getenv("TEST_HEADLESS"))
    print(os.getenv("TEST_SLOW_MO"))
""", headed=True, slow_mo_ms=500)

    assert result.status == "通过"
    assert "0\nfalse\n500" in result.output


def test_runner_defaults_to_headless_environment():
    result = _run("""
import os

def test_case():
    print(os.getenv("PLAYWRIGHT_HEADLESS"))
    print(os.getenv("TEST_HEADLESS"))
    print(os.getenv("TEST_SLOW_MO"))
""")

    assert result.status == "通过"
    assert "1\ntrue\n0" in result.output


def test_runner_forces_visual_playwright_launch_options():
    runner = LocalScriptRunner()
    code = """
async def test_case():
    browser = await p.chromium.launch()
"""

    normalized = runner._normalize_playwright_code(code, headed=True, slow_mo_ms=500)

    assert "chromium.launch(headless=False, slow_mo=500)" in normalized


def test_runner_keeps_normal_runs_headless():
    runner = LocalScriptRunner()
    code = "browser = await p.chromium.launch(headless=False, slow_mo=200)"

    normalized = runner._normalize_playwright_code(code, headed=False)

    assert "headless=True" in normalized


def test_runner_normalizes_generic_login_placeholders():
    runner = LocalScriptRunner()
    code = """
async def test_case():
    await page.get_by_placeholder('用户名').fill(username)
    await page.get_by_placeholder("密码").fill(password)
"""

    normalized = runner._normalize_playwright_code(code, headed=False)

    assert "placeholder*='员工号'" in normalized
    assert "placeholder*='手机号'" in normalized
    assert "input[type='text']" in normalized
    assert "input[type='password']" in normalized
    assert "get_by_placeholder('用户名')" not in normalized
    assert 'get_by_placeholder("密码")' not in normalized


def test_runner_rewrites_hard_login_placeholder_failures_to_helpers():
    runner = LocalScriptRunner()
    code = """
import asyncio
from playwright.async_api import async_playwright

async def test_case():
    username_input = page.get_by_placeholder("请输入员工号")
    if await username_input.count() == 0:
        raise RuntimeError("Login input with placeholder '请输入员工号' not found")
    await username_input.fill(username)
    password_input = page.get_by_placeholder("请输入密码")
    if await password_input.count() == 0:
        raise RuntimeError("Login input with placeholder '请输入密码' not found")
    await password_input.fill(password)
    login_button = page.get_by_text("登录", exact=True)
    if await login_button.count() == 0:
        raise RuntimeError("Login button with text '登录' not found")
    await login_button.click()
"""

    normalized = runner._normalize_playwright_code(code, headed=True, slow_mo_ms=500)

    assert "AITESTLINK_PLAYWRIGHT_HELPERS_V1" in normalized
    assert 'await __aitestlink_fill_login_field(page, "username", username, required=True)' in normalized
    assert 'await __aitestlink_fill_login_field(page, "password", password, required=True)' in normalized
    assert "await __aitestlink_click_login(page)" in normalized
    assert "Login input with placeholder" not in normalized


def test_runner_normalizes_generic_menu_locators():
    runner = LocalScriptRunner()
    code = """
async def test_case():
    await page.locator('[class*="menu-item"]').filter(has_text="促销活动管理").click()
    await page.locator('[class*="menu-item"], [class*="submenu-item"], li').filter(has_text="活动申请转交").click()
"""

    normalized = runner._normalize_playwright_code(code, headed=False)

    assert 'span[title=\\"促销活动管理\\"]' in normalized
    assert 'span[title=\\"活动申请转交\\"]' in normalized
    assert "[class*=\"menu-item\"]" not in normalized


def test_timeout_message_points_to_likely_locator_wait():
    runner = LocalScriptRunner()
    message = runner._timeout_message("""
from playwright.async_api import async_playwright
async def test_case():
    await page.get_by_placeholder('用户名').fill('demo')
""", timeout=30, process_timeout=75)

    assert "可能卡在页面元素定位" in message
    assert "placeholder=“用户名”" in message


def test_runner_gives_playwright_time_to_return_its_own_timeout_error():
    result = _run("""
import asyncio
from playwright.async_api import async_playwright

async def test_case():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        page.set_default_timeout(1000)
        await page.set_content("<button>登录</button>")
        await page.get_by_placeholder("用户名").fill("demo")
        await browser.close()
""")

    assert result.status == "失败"
    assert "失败摘要" in result.error
    assert "Playwright 等待页面元素超时" in result.error
    assert "Traceback" not in result.error
    assert "原始错误" not in result.error
    assert "脚本执行器外层超时" not in result.error


def test_runner_hides_traceback_and_humanizes_runtime_error():
    result = _run("""
async def test_case():
    raise RuntimeError("Login input with placeholder '请输入员工号' not found")
""")

    assert result.status == "失败"
    assert "失败摘要" in result.error
    assert "登录页字段未就绪或定位不匹配" in result.error
    assert "请输入员工号" in result.error
    assert "Traceback" not in result.error
    assert "原始错误" not in result.error
