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


@dataclass
class ScriptRunResult:
    status: str
    output: str
    error: str
    duration_seconds: float
    return_code: int | None


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
        with tempfile.TemporaryDirectory(prefix="aitestlink-run-") as tmpdir:
            script_path = Path(tmpdir) / "script_under_test.py"
            script_path.write_text(prepared.code, encoding="utf-8")
            env = self._build_env(variables, headed=headed, slow_mo_ms=slow_mo_ms)
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
                )

        output = stdout.decode("utf-8", errors="replace") if stdout else ""
        error = stderr.decode("utf-8", errors="replace") if stderr else ""
        return ScriptRunResult(
            "通过" if process.returncode == 0 else "失败",
            self._trim(output),
            self._trim(self._format_error(error)),
            round(time.perf_counter() - started, 3),
            process.returncode,
        )

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
        call = f"asyncio.run({name}())" if is_async else f"{name}()"
        return (
            "import asyncio\n"
            "if __name__ == '__main__':\n"
            f"    print('{RUN_MARKER_START}:{name}', flush=True)\n"
            f"    {call}\n"
            f"    print('{RUN_MARKER_DONE}:{name}', flush=True)"
        )

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
        code = self._normalize_menu_text_locators(code)
        if "playwright" not in code and "chromium.launch" not in code:
            return code
        if headed:
            slow_mo = max(0, min(int(slow_mo_ms or 0), 3000))
            code = self._force_playwright_launch_options(code, headless=False, slow_mo=slow_mo)
        else:
            code = code.replace("headless=False", "headless=True")
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
        return code

    def _force_playwright_launch_options(self, code: str, *, headless: bool, slow_mo: int) -> str:
        def rewrite(match: re.Match[str]) -> str:
            args = match.group("args").strip()
            args = re.sub(r"headless\s*=\s*(True|False)", f"headless={headless}", args)
            args = re.sub(r"slow_mo\s*=\s*[^,\)]*", f"slow_mo={slow_mo}", args)
            if "headless=" not in args:
                args = f"headless={headless}" + (f", {args}" if args else "")
            if "slow_mo=" not in args:
                args = f"{args}, slow_mo={slow_mo}"
            return f"chromium.launch({args})"

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
            return error
        return f"失败摘要：{summary}\n\n原始错误：\n{error}"

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
            return runtime_line or "脚本主动抛出了 RuntimeError。"
        if "SyntaxError" in error:
            return "脚本存在 Python 语法错误，通常是生成脚本把中文步骤或非代码内容写进了代码主体。"
        return ""

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
