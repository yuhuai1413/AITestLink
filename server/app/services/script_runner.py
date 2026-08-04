from __future__ import annotations

import asyncio
import ast
import os
import re
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path


MAX_OUTPUT_CHARS = 60000
MAX_TIMEOUT_SECONDS = 300
PLAYWRIGHT_TIMEOUT_GRACE_SECONDS = 45
PLAYWRIGHT_IMPORT_HINT = "Playwright 依赖未安装。请在后端环境执行：pip install playwright && python -m playwright install chromium"
RUN_MARKER_START = "AITESTLINK_TEST_ENTRY_START"
RUN_MARKER_DONE = "AITESTLINK_TEST_ENTRY_DONE"
AITESTLINK_HELPER_MARKER = "AITESTLINK_PLAYWRIGHT_HELPERS_V1"


PLAYWRIGHT_HELPER_CODE = r'''
# AITESTLINK_PLAYWRIGHT_HELPERS_V1
import os as __aitestlink_os

# 执行失败时自动截图：register 把当前 page 存起来，capture_failure 在异常时截图。
# 截图保存到环境变量 AITESTLINK_SCREENSHOT_DIR 指定的目录，文件名固定，主进程
# 解析 stdout 里的 AITESTLINK_SCREENSHOT:<path> 标记拿到路径并关联到缺陷。
__aitestlink_current_page = None


def __aitestlink_register_page(page):
    global __aitestlink_current_page
    __aitestlink_current_page = page
    # 抬高 Playwright 默认超时：读取注入的 TEST_TIMEOUT_MS（基于环境超时计算，
    # 默认 30000），覆盖 Playwright 硬编码的 30s 导航/操作超时，避免页面稍慢
    # 就 Page.goto: Timeout 30000ms exceeded 导致整个脚本中途失败。
    try:
        _t = __aitestlink_os.environ.get("TEST_TIMEOUT_MS")
        if _t:
            _ms = int(_t)
            page.set_default_navigation_timeout(_ms)
            page.set_default_timeout(_ms)
    except Exception:
        pass
    return page


async def __aitestlink_capture_failure(prefix="fail"):
    """捕获执行失败现场：对当前页面截图。失败也不抛错（截图是辅助流程）。"""
    global __aitestlink_current_page
    page = __aitestlink_current_page
    if page is None:
        return None
    screenshot_dir = __aitestlink_os.environ.get("AITESTLINK_SCREENSHOT_DIR", "")
    if not screenshot_dir:
        return None
    try:
        __aitestlink_os.makedirs(screenshot_dir, exist_ok=True)
        path = __aitestlink_os.path.join(screenshot_dir, f"{prefix}.png")
        # full_page=True 尽量截全页面，便于排查定位问题
        await page.screenshot(path=path, full_page=True, timeout=8000)
        print(f"AITESTLINK_SCREENSHOT:{path}", flush=True)
        return path
    except Exception:
        # 页面可能已关闭/崩溃，截图失败不影响主流程的错误上报
        return None


async def __aitestlink_wait_page_ready(page, timeout=15000):
    try:
        await page.wait_for_load_state("domcontentloaded", timeout=timeout)
    except Exception:
        pass
    try:
        await page.wait_for_load_state("networkidle", timeout=min(timeout, 8000))
    except Exception:
        pass


async def __aitestlink_visible_locator(page, selectors, timeout=20000):
    deadline = __import__("time").monotonic() + timeout / 1000
    last_error = None
    while __import__("time").monotonic() < deadline:
        frames = [page] + list(getattr(page, "frames", []))
        for frame in frames:
            for selector in selectors:
                locator = frame.locator(selector).first
                try:
                    if await locator.count() > 0 and await locator.is_visible(timeout=600):
                        return locator
                except Exception as exc:
                    last_error = exc
        await page.wait_for_timeout(300)
    return None


async def __aitestlink_collect_inputs(page):
    items = []
    try:
        frames = [page] + list(getattr(page, "frames", []))
        for index, frame in enumerate(frames):
            try:
                inputs = await frame.locator("input, textarea").evaluate_all(
                    """els => els.slice(0, 20).map(el => ({
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type') || '',
                        placeholder: el.getAttribute('placeholder') || '',
                        name: el.getAttribute('name') || '',
                        id: el.id || '',
                        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                    }))"""
                )
                for item in inputs:
                    item["frameIndex"] = index
                    items.append(item)
            except Exception:
                continue
    except Exception:
        pass
    return items[:30]


async def __aitestlink_fill_login_field(page, field, value, required=True, timeout=22000):
    await __aitestlink_wait_page_ready(page)
    selectors = {
        "username": [
            "input[placeholder='请输入员工号']",
            "input[placeholder*='员工号']",
            "input[placeholder*='手机号']",
            "input[placeholder*='登录账号']",
            "input[placeholder*='账号']",
            "input[placeholder*='用户名']",
            "input[name*='user' i]",
            "input[name*='account' i]",
            "input[type='text']",
            "input:not([type])",
        ],
        "password": [
            "input[placeholder='请输入密码']",
            "input[placeholder*='密码']",
            "input[type='password']",
        ],
        "captcha": [
            "input[placeholder='请输入验证码']",
            "input[placeholder*='验证码']",
            "input[placeholder*='校验码']",
            "input[placeholder*='图形码']",
        ],
    }.get(field, [])
    locator = await __aitestlink_visible_locator(page, selectors, timeout=timeout)
    if not locator:
        if not required:
            return False
        inputs = await __aitestlink_collect_inputs(page)
        labels = {"username": "账号/员工号", "password": "密码", "captcha": "验证码"}
        raise RuntimeError(
            f"未找到可填写的{labels.get(field, '登录')}输入框。"
            f"系统已等待登录页加载并尝试多个候选定位器，但当前页面没有匹配字段。"
            f"当前页面输入框：{inputs}"
        )
    await locator.fill(str(value or ""))
    return True


async def __aitestlink_click_login(page, timeout=12000):
    selectors = [
        "button:has-text('登录')",
        "[role='button']:has-text('登录')",
        "input[type='submit']",
        ".el-button:has-text('登录')",
        "span:has-text('登录')",
        "div:has-text('登录')",
    ]
    locator = await __aitestlink_visible_locator(page, selectors, timeout=timeout)
    if not locator:
        raise RuntimeError("未找到登录按钮。系统已尝试按钮、角色按钮、提交按钮和包含“登录”的可见元素。")
    await locator.click()
    return True


async def __aitestlink_wait_post_login(page, timeout=20000):
    """登录点击后等待真正进入系统。

    生成的脚本常写 ``page.wait_for_url("**/runtime/homePage", timeout=15000)``，
    但 homePage / dashboard / index 这类主页路径是 AI 猜的，真实系统多半不匹配，
    导致登录明明成功了却在这里等满超时然后整段崩溃 —— 表现为“登录后没有后续操作”。

    本 helper 用更稳健的方式判定登录成功：
      1. 优先等 URL 离开登录页（任何不再含 /login 的 URL）；
      2. 兼容“URL 不变但内容已变”的单页应用：等登录表单消失或侧边菜单出现；
      3. 都不满足时再等一个 DOM 稳定窗口，而不是抛错（把判断权交给后续菜单点击）。
    """
    import time as __aitestlink_time
    deadline = __aitestlink_time.monotonic() + timeout / 1000

    def __looks_like_login_url(url):
        return "/login" in url or url.rstrip("/").endswith("login")

    async def __login_form_gone(page):
        # 登录页特征：仍能看到登录按钮或员工号/密码输入框
        try:
            if await page.locator(
                "input[placeholder*='员工号'], input[placeholder*='账号'], "
                "input[placeholder*='用户名'], input[type='password']"
            ).count() > 0:
                return False
        except Exception:
            pass
        return True

    async def __menu_appeared(page):
        # 进入主页的标志：侧边导航出现
        try:
            for sel in (
                ".el-menu, .ant-menu, nav, aside, [role='menu'], "
                ".sidebar, .layout-sider, .menu-wrapper"
            ):
                if await page.locator(sel).count() > 0:
                    return True
        except Exception:
            pass
        return False

    # 先给点击后一点反应时间
    await page.wait_for_timeout(400)

    while __aitestlink_time.monotonic() < deadline:
        try:
            current = page.url
        except Exception:
            current = ""
        # 1. URL 已离开登录页 → 成功
        if current and not __looks_like_login_url(current):
            await __aitestlink_wait_page_ready(page, timeout=4000)
            return True
        # 2. URL 没变但登录表单已消失 / 主菜单已出现（SPA 路由不变的情况）
        if await __login_form_gone(page) and await __menu_appeared(page):
            await __aitestlink_wait_page_ready(page, timeout=4000)
            return True
        await page.wait_for_timeout(500)

    # 超时也不直接抛错：登录可能是异步跳转、或主页结构未识别到。
    # 给后续步骤一次机会，由真正的业务断言来决定成败。
    await __aitestlink_wait_page_ready(page, timeout=4000)
    return False


async def __aitestlink_click_menu(page, text, timeout=15000):
    """点击后台管理系统的菜单项，兼容多种 UI 框架与菜单结构。

    生成的脚本常直接用 ``get_by_text(name, exact=True)`` 定位菜单，但这种写法很脆弱：
    登录后 SPA 异步加载菜单、菜单可能折叠、文本可能带图标后缀或嵌在 span 里。
    本 helper 先等待菜单出现，再按多组选择器策略（element-ui / antd / 通用 menu）
    找到可见且可点击的菜单项点击。子菜单展开会异步加载，所以也处理“已点击父菜单
    但子项尚未渲染”的情况。
    """
    safe = str(text or "").strip()
    if not safe:
        raise RuntimeError("菜单文本为空，无法定位")
    # 多组定位策略，按优先级排列：title 属性最精确，其次常见框架的菜单类，最后兜底文本匹配
    selectors = [
        "span[title='{t}']",
        "*[title='{t}']",
        ".el-submenu__title:has-text('{t}')",
        ".el-menu-item:has-text('{t}')",
        ".el-submenu:has-text('{t}')",
        "[role='menuitem']:has-text('{t}')",
        "[role='menuitemradio']:has-text('{t}')",
        ".ant-menu-submenu-title:has-text('{t}')",
        ".ant-menu-item:has-text('{t}')",
        "li:has-text('{t}')",
        "a:has-text('{t}')",
        "span:has-text('{t}')",
    ]
    norm_selectors = [s.replace("{t}", safe.replace("'", "\\'")) for s in selectors]
    locator = await __aitestlink_visible_locator(page, norm_selectors, timeout=timeout)
    if locator:
        await locator.click()
        return True
    # 兜底：text 模糊匹配（非 exact），允许菜单文本带额外空白/图标后缀
    fallback = page.get_by_text(safe).first
    try:
        await fallback.wait_for(state="visible", timeout=4000)
        await fallback.click()
        return True
    except Exception:
        pass
    raise RuntimeError(
        f"未找到“{safe}”菜单。已等待页面加载并尝试多种菜单定位策略"
        f"（title、element-ui、antd、role=menuitem 等）。常见原因："
        f"账号无此菜单权限、菜单名称与实际不符、或菜单在折叠侧边栏中未展开。"
    )
'''


@dataclass
class ScriptRunResult:
    status: str
    output: str
    error: str
    duration_seconds: float
    return_code: int | None
    screenshot_path: str | None = None


class LocalScriptRunner:
    """Run an automation script in a separate local process.

    This is a development/local runner. Production can replace this service with
    a container or queue worker while keeping the same router contract.
    """

    async def run_python(
        self,
        *,
        code: str,
        variables: dict[str, str],
        timeout_seconds: int,
        headed: bool = False,
        slow_mo_ms: int = 0,
    ) -> ScriptRunResult:
        if not code.strip():
            return ScriptRunResult("失败", "", "脚本代码为空", 0, None)

        prepared = self._prepare_executable_code(self._normalize_playwright_code(code, headed=headed, slow_mo_ms=slow_mo_ms))
        if not prepared.ok:
            return ScriptRunResult("失败", "", prepared.error, 0, None)

        timeout = max(1, min(timeout_seconds, MAX_TIMEOUT_SECONDS))
        process_timeout = self._process_timeout_seconds(prepared.code, timeout)
        started = time.perf_counter()

        # 截图目录：放在持久化的 uploads 下，子进程失败时把页面截图写到这里，
        # 主进程从 stdout 的 AITESTLINK_SCREENSHOT:<path> 标记拿到路径并关联缺陷。
        screenshot_path_captured: str | None = None
        try:
            from app.config import settings
            screenshot_dir = str(Path(settings.UPLOAD_DIR) / "script-screenshots")
        except Exception:
            screenshot_dir = ""

        with tempfile.TemporaryDirectory(prefix="aitestlink-run-") as tmpdir:
            script_path = Path(tmpdir) / "script_under_test.py"
            script_path.write_text(prepared.code, encoding="utf-8")
            env = self._build_env(variables, headed=headed, slow_mo_ms=slow_mo_ms)
            if screenshot_dir:
                env["AITESTLINK_SCREENSHOT_DIR"] = screenshot_dir
            try:
                executable = await self._resolve_python_executable(prepared.code)
                if executable is None:
                    return ScriptRunResult(
                        "失败",
                        "",
                        PLAYWRIGHT_IMPORT_HINT,
                        round(time.perf_counter() - started, 3),
                        None,
                    )
                process = await asyncio.create_subprocess_exec(
                    executable,
                    str(script_path),
                    cwd=tmpdir,
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=process_timeout)
            except asyncio.TimeoutError:
                if "process" in locals() and process.returncode is None:
                    process.kill()
                    await process.communicate()
                return ScriptRunResult(
                    "失败",
                    "",
                    self._timeout_message(prepared.code, timeout, process_timeout),
                    round(time.perf_counter() - started, 3),
                    None,
                    self._extract_screenshot_marker(stdout if "stdout" in locals() else b""),
                )

        output = stdout.decode("utf-8", errors="replace") if stdout else ""
        error = stderr.decode("utf-8", errors="replace") if stderr else ""
        screenshot_path_captured = self._extract_screenshot_marker(stdout)
        return ScriptRunResult(
            "通过" if process.returncode == 0 else "失败",
            self._trim(output),
            self._trim(self._format_error(error)),
            round(time.perf_counter() - started, 3),
            process.returncode,
            screenshot_path_captured,
        )

    def _extract_screenshot_marker(self, stdout_bytes) -> str | None:
        """从子进程 stdout 解析 AITESTLINK_SCREENSHOT:<path> 标记，返回截图绝对路径。"""
        if not stdout_bytes:
            return None
        try:
            text = stdout_bytes.decode("utf-8", errors="replace") if isinstance(stdout_bytes, (bytes, bytearray)) else str(stdout_bytes)
        except Exception:
            return None
        marker = "AITESTLINK_SCREENSHOT:"
        for line in text.splitlines():
            idx = line.find(marker)
            if idx >= 0:
                path = line[idx + len(marker):].strip()
                if path and Path(path).exists():
                    return path
        return None

    @dataclass
    class _PreparedCode:
        ok: bool
        code: str
        error: str = ""

    def _prepare_executable_code(self, code: str) -> _PreparedCode:
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return self._PreparedCode(False, code, f"脚本语法错误：{exc}")

        if self._has_explicit_entry(tree):
            return self._PreparedCode(True, code)

        target = self._find_callable_entry(tree)
        if target:
            wrapper = self._entry_wrapper(target)
            return self._PreparedCode(True, f"{code.rstrip()}\n\n{wrapper}\n")

        if self._has_top_level_executable_statement(tree):
            return self._PreparedCode(True, code)

        return self._PreparedCode(
            False,
            code,
            "脚本没有可执行入口。请生成或补充 if __name__ == '__main__': asyncio.run(test_case())",
        )

    def _has_explicit_entry(self, tree: ast.Module) -> bool:
        for node in ast.walk(tree):
            if isinstance(node, ast.If) and self._is_main_guard(node.test):
                return True
            if isinstance(node, ast.Call) and self._call_name(node.func) in {"asyncio.run", "pytest.main"}:
                return True
        return False

    def _find_callable_entry(self, tree: ast.Module) -> tuple[str, bool] | None:
        funcs: list[tuple[str, bool]] = []
        for node in tree.body:
            if isinstance(node, ast.AsyncFunctionDef):
                funcs.append((node.name, True))
            elif isinstance(node, ast.FunctionDef):
                funcs.append((node.name, False))
        for preferred in ("test_case", "main", "run", "test"):
            for item in funcs:
                if item[0] == preferred:
                    return item
        for item in funcs:
            if item[0].startswith("test_"):
                return item
        return funcs[0] if len(funcs) == 1 else None

    def _entry_wrapper(self, target: tuple[str, bool]) -> str:
        name, is_async = target
        if is_async:
            # 用一个 async wrapper 包裹目标：失败时在同一事件循环里截图，
            # 再重新抛出原异常。截图 helper 内部已吞掉自身异常。
            wrapper = (
                "import asyncio\n"
                "async def __aitestlink_run_with_capture():\n"
                "    try:\n"
                f"        await {name}()\n"
                "    except Exception:\n"
                "        try:\n"
                "            await __aitestlink_capture_failure()\n"
                "        except Exception:\n"
                "            pass\n"
                "        raise\n"
                "\n"
                "if __name__ == '__main__':\n"
                f"    print('{RUN_MARKER_START}:{name}', flush=True)\n"
                "    asyncio.run(__aitestlink_run_with_capture())\n"
                f"    print('{RUN_MARKER_DONE}:{name}', flush=True)"
            )
        else:
            wrapper = (
                "import asyncio\n"
                "if __name__ == '__main__':\n"
                f"    print('{RUN_MARKER_START}:{name}', flush=True)\n"
                f"    {name}()\n"
                f"    print('{RUN_MARKER_DONE}:{name}', flush=True)"
            )
        return wrapper

    def _has_top_level_executable_statement(self, tree: ast.Module) -> bool:
        passive = (ast.Import, ast.ImportFrom, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
        return any(not isinstance(node, passive) for node in tree.body)

    def _is_main_guard(self, node: ast.AST) -> bool:
        if not isinstance(node, ast.Compare) or len(node.ops) != 1 or len(node.comparators) != 1:
            return False
        if not isinstance(node.ops[0], ast.Eq):
            return False
        left, right = node.left, node.comparators[0]
        return (
            isinstance(left, ast.Name)
            and left.id == "__name__"
            and isinstance(right, ast.Constant)
            and right.value == "__main__"
        )

    def _call_name(self, node: ast.AST) -> str:
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            base = self._call_name(node.value)
            return f"{base}.{node.attr}" if base else node.attr
        return ""

    def _build_env(self, variables: dict[str, str], *, headed: bool, slow_mo_ms: int) -> dict[str, str]:
        env = os.environ.copy()
        env.update({key: str(value) for key, value in variables.items() if value is not None})
        env["PYTHONUNBUFFERED"] = "1"
        env["PLAYWRIGHT_HEADLESS"] = "0" if headed else "1"
        env["TEST_HEADLESS"] = "false" if headed else "true"
        env["TEST_SLOW_MO"] = str(max(0, min(int(slow_mo_ms or 0), 3000)))
        timeout = env.get("TEST_TIMEOUT") or "30"
        env.setdefault("TEST_TIMEOUT_MS", str(int(float(timeout)) * 1000) if str(timeout).replace(".", "", 1).isdigit() else "30000")
        return env

    def _normalize_playwright_code(self, code: str, *, headed: bool, slow_mo_ms: int = 0) -> str:
        # Generated scripts sometimes force headed Chromium. Keep normal runs
        # headless, but allow explicit visual execution for local debugging.
        code = self._normalize_login_placeholder_locators(code)
        code = self._normalize_login_hard_failures(code)
        code = self._normalize_menu_text_locators(code)
        code = self._normalize_login_navigation_waits(code)
        code = self._normalize_register_page(code)
        if "playwright" not in code and "chromium.launch" not in code:
            return code
        code = self._inject_playwright_helpers(code)
        if headed:
            slow_mo = max(0, min(int(slow_mo_ms or 0), 3000))
            code = self._force_playwright_launch_options(code, headless=False, slow_mo=slow_mo)
        else:
            # Force headless + route through system Chrome so the script does not
            # depend on Playwright's bundled chromium kernel (which may be missing
            # in restricted networks). Use the same rewrite path as headed mode.
            code = self._force_playwright_launch_options(code, headless=True, slow_mo=0)
        return code

    def _normalize_login_placeholder_locators(self, code: str) -> str:
        """Make common AI-generated login placeholder guesses tolerate real forms.

        Some generated scripts use generic placeholders such as “用户名”, while
        actual systems often use “请输入员工号”, “请输入手机号” or “登录账号”.
        Keep the generated script runnable by rewriting only those generic login
        fill calls to a prioritized selector list.
        """
        username_selector = (
            "input[placeholder='请输入员工号'], "
            "input[placeholder*='员工号'], "
            "input[placeholder*='手机号'], "
            "input[placeholder*='登录账号'], "
            "input[placeholder*='账号'], "
            "input[placeholder*='用户名'], "
            "input[type='text']"
        )
        password_selector = (
            "input[placeholder='请输入密码'], "
            "input[placeholder*='密码'], "
            "input[type='password']"
        )

        def rewrite_username(match: re.Match[str]) -> str:
            return f'page.locator("{username_selector}").first.fill({match.group("value")})'

        def rewrite_password(match: re.Match[str]) -> str:
            return f'page.locator("{password_selector}").first.fill({match.group("value")})'

        code = re.sub(
            r"page\.get_by_placeholder\((?P<quote>['\"])(?:用户名|请输入用户名)(?P=quote)\)\.fill\((?P<value>[^)]*)\)",
            rewrite_username,
            code,
        )
        return re.sub(
            r"page\.get_by_placeholder\((?P<quote>['\"])(?:密码)(?P=quote)\)\.fill\((?P<value>[^)]*)\)",
            rewrite_password,
            code,
        )

    def _normalize_login_hard_failures(self, code: str) -> str:
        """Replace brittle generated login snippets with guarded helpers.

        The LLM often emits:
            locator = page.get_by_placeholder("请输入员工号")
            if await locator.count() == 0: raise RuntimeError(...)
            await locator.fill(username)

        On slow visual runs this fails before the login form is visible. The
        helper waits for page readiness, tries multiple real-world selectors,
        checks frames, and raises a Chinese diagnostic only after exhausting
        candidates.
        """
        fields = [
            ("username", r"请输入员工号|员工号|请输入手机号|手机号|登录账号|账号|请输入用户名|用户名"),
            ("password", r"请输入密码|密码"),
            ("captcha", r"请输入验证码|验证码|校验码|图形验证码|图形码"),
        ]

        for field, placeholder_pattern in fields:
            code = self._rewrite_login_assignment_fill(code, field, placeholder_pattern)
            code = self._rewrite_direct_placeholder_fill(code, field, placeholder_pattern)

        code = self._rewrite_login_button_click(code)
        return code

    def _rewrite_login_assignment_fill(self, code: str, field: str, placeholder_pattern: str) -> str:
        pattern = re.compile(
            rf"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*page\.get_by_placeholder\((?P<quote>['\"])(?:{placeholder_pattern})(?P=quote)\)\s*\n"
            rf"(?:(?P=indent)if\s+await\s+(?P=var)\.count\(\)\s*==\s*0:\s*\n"
            rf"(?P=indent)[ \t]+raise\s+RuntimeError\([^\n]*\)\s*\n)?"
            rf"(?P=indent)await\s+(?P=var)\.fill\((?P<value>[^)]*)\)",
            re.MULTILINE,
        )

        def rewrite(match: re.Match[str]) -> str:
            required = "False" if field == "captcha" else "True"
            return (
                f"{match.group('indent')}await __aitestlink_fill_login_field("
                f"page, \"{field}\", {match.group('value').strip()}, required={required})"
            )

        return pattern.sub(rewrite, code)

    def _rewrite_direct_placeholder_fill(self, code: str, field: str, placeholder_pattern: str) -> str:
        pattern = re.compile(
            rf"(?P<indent>[ \t]*)await\s+page\.get_by_placeholder\((?P<quote>['\"])(?:{placeholder_pattern})(?P=quote)\)\.fill\((?P<value>[^)]*)\)",
            re.MULTILINE,
        )

        def rewrite(match: re.Match[str]) -> str:
            required = "False" if field == "captcha" else "True"
            return (
                f"{match.group('indent')}await __aitestlink_fill_login_field("
                f"page, \"{field}\", {match.group('value').strip()}, required={required})"
            )

        return pattern.sub(rewrite, code)

    def _rewrite_login_button_click(self, code: str) -> str:
        pattern = re.compile(
            r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*page\.get_by_(?:text|role)\([^\n]*登录[^\n]*\)\s*\n"
            r"(?:(?P=indent)if\s+await\s+(?P=var)\.count\(\)\s*==\s*0:\s*\n"
            r"(?P=indent)[ \t]+raise\s+RuntimeError\([^\n]*\)\s*\n)?"
            r"(?P=indent)await\s+(?P=var)(?:\.first)?\.click\([^\n]*\)",
            re.MULTILINE,
        )
        return pattern.sub(lambda match: f"{match.group('indent')}await __aitestlink_click_login(page)", code)

    def _inject_playwright_helpers(self, code: str) -> str:
        if AITESTLINK_HELPER_MARKER in code:
            return code
        insert_at = 0
        matches = list(re.finditer(r"^(?:from\s+\S+\s+import\s+.*|import\s+.+)\s*$", code, re.MULTILINE))
        if matches:
            insert_at = matches[-1].end()
        return f"{code[:insert_at]}\n{PLAYWRIGHT_HELPER_CODE}\n{code[insert_at:]}"

    def _normalize_menu_text_locators(self, code: str) -> str:
        """Rewrite broad AI-guessed menu locators to text/title based menu clicks."""

        def quote_text(value: str) -> str:
            return value.replace("\\", "\\\\").replace('"', '\\"')

        def menu_click(text: str) -> str:
            safe = quote_text(text)
            return (
                f'page.locator("span[title=\\"{safe}\\"], '
                f'.el-submenu__title:has-text(\\"{safe}\\"), '
                f'.el-menu-item:has-text(\\"{safe}\\"), '
                f'[role=\\"menuitem\\"]:has-text(\\"{safe}\\")").first.click()'
            )

        patterns = [
            r"page\.locator\((?P<quote>['\"])\[class\*=(?:\\?['\"])?menu-item(?:\\?['\"])?\](?P=quote)\)\.filter\(has_text=(?P<tq>['\"])(?P<text>[^'\"]+)(?P=tq)\)\.click\(\)",
            r"page\.locator\((?P<quote>['\"])\[class\*=(?:\\?['\"])?menu-item(?:\\?['\"])?\],\s*\[class\*=(?:\\?['\"])?submenu-item(?:\\?['\"])?\],\s*li(?P=quote)\)\.filter\(has_text=(?P<tq>['\"])(?P<text>[^'\"]+)(?P=tq)\)\.click\(\)",
        ]
        for pattern in patterns:
            code = re.sub(pattern, lambda match: menu_click(match.group("text")), code)

        # Rewrite the common AI-generated "menu click with guard" pattern:
        #     var = page.get_by_text('菜单名', exact=True)
        #     if await var.count():
        #         await var.click()
        #     else:
        #         raise RuntimeError('...菜单...')
        # into a robust helper call that waits for the menu and tries multiple
        # locator strategies. The original pattern fails immediately when the SPA
        # has not finished rendering the menu after login.
        def _menu_replacement(match: re.Match[str]) -> str:
            text = match.group("text")
            # Leave login-button clicks to the dedicated login-button rewriter.
            if text.strip() in {"登录", "登陆", "登 录", "Sign in", "Login"}:
                return match.group(0)
            safe = text.replace("\\", "\\\\").replace('"', '\\"')
            return f"{match.group('indent')}await __aitestlink_click_menu(page, \"{safe}\")"

        guard_pattern = re.compile(
            r"(?P<indent>[ \t]*)[A-Za-z_][A-Za-z0-9_]*\s*=\s*"
            r"page\.get_by_text\((?P<tq>['\"])(?P<text>[^'\"]+)(?P=tq)"
            r"(?:,\s*exact=(?:True|False))?\)\s*\n"
            r"(?P=indent)(?:if\s+await\s+[A-Za-z_][A-Za-z0-9_]*\.count\(\)(?:\s*[><=]=?\s*\d+)?\s*:\s*\n"
            r"(?P=indent)[ \t]+await\s+[A-Za-z_][A-Za-z0-9_]*\.click\(\)\s*\n"
            r"(?P=indent)else:\s*\n"
            r"(?P=indent)[ \t]+raise\s+RuntimeError\([^\n]*\)|"
            r"await\s+[A-Za-z_][A-Za-z0-9_]*\.click\(\))",
            re.MULTILINE,
        )
        code = guard_pattern.sub(_menu_replacement, code)

        # Also rewrite bare "page.get_by_text('菜单名').click()" into the helper.
        # The optional leading "await " is consumed so the replacement (which
        # already emits its own await) does not produce "await await ...".
        bare_pattern = re.compile(
            r"(?P<indent>[ \t]*)(?:await\s+)?page\.get_by_text\((?P<tq>['\"])(?P<text>[^'\"]+)(?P=tq)"
            r"(?:,\s*exact=(?:True|False))?\)\.click\(\)"
        )
        code = bare_pattern.sub(_menu_replacement, code)

        # Rewrite the "assign then click" pattern that the single-block regex
        # misses when comments / blank lines sit between the assignment and the
        # click. The AI frequently emits:
        #     menu_x = page.get_by_text('定价管理', exact=True)
        #     # ... comment ...
        #     await menu_x.click()
        #     # or with chained indexers:
        #     menu_y = page.get_by_text('报价单管理', exact=False).first
        #     await menu_y.click()
        # We collect every "<var> = page.get_by_text('TEXT', ...)" mapping
        # first, then rewrite any later "await <var>.click()" (with optional
        # .first / .nth(N)) into the robust helper. The assignment line is left
        # in place because some vars are also used for non-click reads.
        assign_pattern = re.compile(
            r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*"
            r"page\.get_by_text\((?P<tq>['\"])(?P<text>[^'\"]+)(?P=tq)"
            r"(?:,\s*exact=(?:True|False))?\)"
            r"(?:\.first|\.nth\(\d+\))?\s*(?:#.*)?$",
            re.MULTILINE,
        )
        menu_vars: dict[str, str] = {}
        for m in assign_pattern.finditer(code):
            text = m.group("text")
            # Leave login-button locators to the dedicated login rewriter.
            if text.strip() in {"登录", "登陆", "登 录", "Sign in", "Login"}:
                continue
            menu_vars[m.group("var")] = text

        def _var_click_replacement(match: re.Match[str]) -> str:
            var = match.group("var")
            text = menu_vars.get(var)
            if text is None:
                return match.group(0)
            safe = text.replace("\\", "\\\\").replace('"', '\\"')
            indent = match.group("indent")
            return f'{indent}await __aitestlink_click_menu(page, "{safe}")'

        if menu_vars:
            # await <var>.first.click() / await <var>.nth(N).click() / await <var>.click()
            var_click_pattern = re.compile(
                r"(?P<indent>[ \t]*)await\s+(?P<var>[A-Za-z_][A-Za-z0-9_]*)"
                r"(?:\.first|\.nth\(\d+\))?\.click\(\)"
            )
            code = var_click_pattern.sub(_var_click_replacement, code)
        return code

    def _normalize_login_navigation_waits(self, code: str) -> str:
        """Replace brittle post-login navigation waits with robust helpers.

        Two AI-generated patterns reliably hang real SPA back-ends and mask the
        real failure ("登录后没有后续操作"):

        1. ``page.wait_for_url("**/runtime/homePage", timeout=15000)`` — the
           home URL is guessed; if the real app does not match the glob this
           waits out the full timeout and then *throws*, aborting every later
           step even though login itself succeeded.
        2. ``page.wait_for_load_state("networkidle")`` — long-lived SPA sockets
           (websocket / polling) mean networkidle is never reached, so this also
           hangs to timeout.

        Rewrite #1 to ``__aitestlink_wait_post_login(page)`` which waits until
        the URL leaves the login page (or the login form disappears) without
        depending on a guessed home path. Rewrite #2 to
        ``__aitestlink_wait_page_ready(page)`` which uses bounded domcontentloaded
        + networkidle waits that never throw.
        """
        # 1. wait_for_url(<any glob/regex arg>, optional timeout=...) — the
        #    whole call is replaced. We must NOT touch wait_for_url() calls that
        #    have no argument, and we leave the helper itself untouched.
        code = re.sub(
            r"(?P<indent>[ \t]*)await\s+page\.wait_for_url\(\s*"
            r"(?P<arg>[^)]*?)\s*(?:,\s*timeout\s*=\s*\d+)?\s*\)\s*\n",
            lambda m: f"{m.group('indent')}await __aitestlink_wait_post_login(page)\n",
            code,
        )

        # 2. wait_for_load_state("networkidle") / ('networkidle') — replace with
        #    the bounded, non-throwing wait_page_ready helper. Leave other load
        #    states (domcontentloaded / load) intact since those are fine.
        code = re.sub(
            r"(?P<indent>[ \t]*)await\s+page\.wait_for_load_state\(\s*"
            r"(['\"])(?:networkidle)\2\s*(?:,\s*timeout\s*=\s*\d+)?\s*\)\s*\n",
            lambda m: f"{m.group('indent')}await __aitestlink_wait_page_ready(page)\n",
            code,
        )
        return code

    def _normalize_register_page(self, code: str) -> str:
        """Rewrite ``page = await context.new_page()`` to also register the page
        globally so the failure-screenshot helper can capture it on error.

        Without this, the page object lives only inside test_case() and the
        outer entry wrapper cannot reach it to screenshot when the test fails.
        """
        def _replace(match: re.Match[str]) -> str:
            indent = match.group("indent")
            var = match.group("var")
            call = match.group("call")
            return f"{indent}{var} = await {call}\n{indent}__aitestlink_register_page({var})"

        # 匹配 page = await <something>.new_page()，兼容 context/page_factory 等变量名
        code = re.sub(
            r"(?P<indent>[ \t]*)(?P<var>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*await\s+"
            r"(?P<call>[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.new_page\(\))",
            _replace,
            code,
        )
        return code

    def _force_playwright_launch_options(self, code: str, *, headless: bool, slow_mo: int) -> str:
        def rewrite(match: re.Match[str]) -> str:
            args = match.group("args").strip()
            # Prefer system Chrome (channel="chrome") so execution does not depend
            # on Playwright's bundled chromium kernel, which may fail to download
            # in restricted networks. Only set channel if the script did not specify one.
            channel_clause = ""
            if "channel" not in args:
                channel_clause = 'channel="chrome", '
            args = re.sub(r"headless\s*=\s*(True|False)", f"headless={headless}", args)
            args = re.sub(r"slow_mo\s*=\s*[^,\)]*", f"slow_mo={slow_mo}", args)
            if "headless=" not in args:
                args = f"headless={headless}" + (f", {args}" if args else "")
            if "slow_mo=" not in args:
                args = f"{args}, slow_mo={slow_mo}"
            return f"chromium.launch({channel_clause}{args})"

        return re.sub(r"chromium\.launch\((?P<args>[^)]*)\)", rewrite, code)

    def _process_timeout_seconds(self, code: str, timeout: int) -> int:
        if "playwright" not in code and "chromium.launch" not in code:
            return timeout
        return min(MAX_TIMEOUT_SECONDS, timeout + PLAYWRIGHT_TIMEOUT_GRACE_SECONDS)

    def _timeout_message(self, code: str, timeout: int, process_timeout: int) -> str:
        if "playwright" in code:
            locator_hint = self._locator_wait_hint(code)
            if locator_hint:
                return (
                    f"脚本执行器外层超时：测试操作超时时间为 {timeout} 秒，进程在 {process_timeout} 秒内仍未结束。\n"
                    f"可能卡在页面元素定位：{locator_hint}\n"
                    "可视化执行时，如果脚本没有在异常后关闭浏览器窗口，外层执行器会强制终止进程。"
                )
            return (
                f"脚本执行器外层超时：测试操作超时时间为 {timeout} 秒，"
                f"进程在 {process_timeout} 秒内仍未结束。请检查脚本是否存在未关闭浏览器、死循环或长时间等待。"
            )
        return f"脚本执行超时，超过 {timeout} 秒未完成"

    def _locator_wait_hint(self, code: str) -> str:
        placeholders = re.findall(r"get_by_placeholder\(['\"]([^'\"]+)['\"]\)", code)
        if placeholders:
            return "、".join(f"placeholder=“{item}”" for item in placeholders[:3])
        roles = re.findall(r"get_by_role\(['\"]([^'\"]+)['\"]\s*,\s*name\s*=\s*['\"]([^'\"]+)['\"]", code)
        if roles:
            return "、".join(f"role={role}, name=“{name}”" for role, name in roles[:3])
        texts = re.findall(r"get_by_text\(['\"]([^'\"]+)['\"]", code)
        if texts:
            return "、".join(f"text=“{item}”" for item in texts[:3])
        return ""

    def _format_error(self, error: str) -> str:
        if not error.strip():
            return ""
        summary = self._error_summary(error)
        if not summary:
            brief = error.strip()[:300]
            return f"脚本执行失败：{brief}"
        return f"失败摘要：{summary}"

    def _error_summary(self, error: str) -> str:
        if "get_by_placeholder" in error:
            match = re.search(r"get_by_placeholder\(['\"]([^'\"]+)['\"]\)", error)
            target = f"“{match.group(1)}”" if match else "指定 placeholder"
            return f"页面未找到 placeholder 为 {target} 的输入框。通常是生成脚本的定位器与真实页面不一致，请检查登录页字段文案或重新生成脚本。"
        if "Timeout" in error and "Locator" in error:
            return "Playwright 等待页面元素超时，通常是元素定位器不匹配、页面未加载到目标状态，或登录/跳转前置步骤失败。"
        if "RuntimeError" in error:
            lines = [line.strip() for line in error.splitlines() if line.strip()]
            runtime_line = next((line for line in reversed(lines) if "RuntimeError" in line), "")
            message = runtime_line.split("RuntimeError:", 1)[-1].strip() if runtime_line else ""
            return self._humanize_runtime_error(message) or "脚本主动终止执行。"
        if "SyntaxError" in error:
            return "脚本存在 Python 语法错误，通常是生成脚本把中文步骤或非代码内容写进了代码主体。"
        if "Executable doesn't exist" in error:
            return (
                "未找到可用的浏览器内核。脚本默认使用系统已安装的 Chrome/Edge，"
                "请确认本机已安装 Google Chrome；或在终端执行 "
                "`playwright install chromium` 下载 Playwright 自带内核后重试。"
            )
        if "Timeout" in error:
            return "Playwright 操作超时，通常是页面加载缓慢、元素定位器不匹配或网络延迟。"
        if "Error" in error:
            err_lines = [l.strip() for l in error.splitlines() if l.strip()]
            last_err = next((l for l in reversed(err_lines) if "Error" in l or "Exception" in l), "")
            brief = last_err[:200] if last_err else error[:200]
            return f"Playwright 执行出错：{brief}"
        return ""

    def _humanize_runtime_error(self, message: str) -> str:
        if not message:
            return ""
        lowered = message.lower()
        if "login input" in lowered and "placeholder" in lowered and "not found" in lowered:
            target = re.search(r"placeholder ['\"]([^'\"]+)['\"]", message)
            label = target.group(1) if target else "登录输入框"
            return (
                f"登录页字段未就绪或定位不匹配：系统没有找到“{label}”。"
                "执行器会先等待页面加载并尝试多个候选定位器；如果仍失败，请在系统识别结果中确认登录页字段是否可见。"
            )
        if "environment variable" in lowered:
            missing = message.replace("environment variable", "环境变量")
            return f"执行环境配置不完整：{missing}"
        if "not found" in lowered:
            return f"页面元素未找到：{message}"
        if message.startswith("未找到") or message.startswith("找不到") or message.startswith("无法定位"):
            return message
        return message

    async def _resolve_python_executable(self, code: str) -> str | None:
        if "playwright" not in code:
            return sys.executable

        candidates = [sys.executable]
        system_python = shutil.which("python3")
        if system_python and system_python not in candidates:
            candidates.append(system_python)

        for executable in candidates:
            if await self._can_import(executable, "playwright.async_api"):
                return executable
        return None

    async def _can_import(self, executable: str, module: str) -> bool:
        process = await asyncio.create_subprocess_exec(
            executable,
            "-c",
            f"import {module}",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.communicate()
        return process.returncode == 0

    def _trim(self, value: str) -> str:
        if len(value) <= MAX_OUTPUT_CHARS:
            return value
        return value[:MAX_OUTPUT_CHARS] + "\n...输出过长，已截断"
