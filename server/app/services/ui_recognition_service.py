from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.environment_config import EnvironmentConfig, TestAccount
from app.models.requirement import Requirement
from app.models.ui_snapshot import UISnapshot
from app.services.export_format import format_api_datetime
from app.services.ai_input_builder import requirement_records
from app.services.ai_service import AIService
from app.utils import decrypt_value, verify_project_owner


def _friendly_recognition_error(exc: Exception) -> str:
    message = str(exc)
    lowered = message.lower()
    if "executable doesn't exist" in lowered and "playwright" in lowered:
        return "系统识别所需的浏览器运行环境未安装或已损坏，请联系管理员在后端环境执行：python -m playwright install chromium，然后重新识别。"
    if "playwright install" in lowered:
        return "系统识别所需的 Playwright 浏览器未安装，请联系管理员安装浏览器运行环境后重试。"
    if "target page, context or browser has been closed" in lowered:
        return "系统识别浏览器进程异常关闭，请稍后重试；如果持续出现，请联系管理员检查后端浏览器运行环境。"
    return message


def _system_browser_executable() -> str | None:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    return next((path for path in candidates if os.path.exists(path)), None)


class UIRecognitionService:
    """Recognize a target system's UI structure before generating scripts."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def latest_snapshot(self, environment_id: str, user_id: str) -> dict | None:
        environment = await self._environment(environment_id, user_id)
        result = await self.db.execute(
            select(UISnapshot)
            .where(UISnapshot.environment_id == environment.id)
            .order_by(UISnapshot.created_at.desc())
            .limit(1)
        )
        item = result.scalar_one_or_none()
        return self._to_dict(item) if item else None

    async def latest_context_by_project(self, project_id: str, user_id: str) -> dict[str, dict]:
        await verify_project_owner(self.db, project_id, user_id)
        result = await self.db.execute(
            select(UISnapshot)
            .where(UISnapshot.project_id == project_id, UISnapshot.status == "成功")
            .order_by(UISnapshot.environment_id, UISnapshot.created_at.desc())
        )
        contexts: dict[str, dict] = {}
        for item in result.scalars().all():
            if item.environment_id in contexts:
                continue
            try:
                snapshot = json.loads(item.snapshot_json or "{}")
            except json.JSONDecodeError:
                snapshot = {}
            contexts[item.environment_id] = self._compact_context(snapshot)
        return contexts

    async def recognize(
        self,
        environment_id: str,
        user_id: str,
        account_id: str | None = None,
        headed: bool = False,
        scope_mode: str = "full",
        requirement_ids: list[str] | None = None,
        requirement_text: str = "",
    ) -> dict:
        environment = await self._environment(environment_id, user_id)
        # 未手动指定账号时，必须有识别账号（is_admin=True），否则提示用户先配置
        if not account_id:
            admin_exists = (await self.db.execute(
                select(TestAccount).where(
                    TestAccount.environment_id == environment.id,
                    TestAccount.is_admin.is_(True),
                ).limit(1)
            )).scalar_one_or_none()
            if not admin_exists:
                return {
                    "ok": False,
                    "message": "该环境尚未配置识别账号。请在「环境配置 → 账号管理」中标记一个识别账号（优先选能看到完整菜单的角色），再执行系统识别。",
                }
        account = await self._account(environment, account_id)
        started = datetime.now(timezone.utc)
        trace: list[dict[str, Any]] = []
        try:
            self._add_trace(trace, "prepare", "success", f"准备识别环境：{environment.name}", url=environment.web_url or "")
            # 提示是否使用了管理员账号（管理员能看到完整菜单，识别结果更全）
            if account and not account_id:
                if getattr(account, "is_admin", False):
                    self._add_trace(trace, "account", "success", f"使用识别账号：{account.role or account.name}（用于系统识别）")
                else:
                    self._add_trace(trace, "account", "warning", f"当前未指定识别账号，默认使用：{account.role or account.name}。建议在账号管理中标记一个识别账号（优先选能看到完整菜单的角色），以采集到完整的菜单和页面数据")
            snapshot = await self._recognize_with_playwright(environment, account, headed=headed, trace=trace)
            scope = await self._build_scope(
                environment.project_id,
                mode=scope_mode,
                requirement_ids=requirement_ids or [],
                requirement_text=requirement_text,
            )
            snapshot["scope"] = scope
            self._add_trace(trace, "build_scope", "success", f"识别范围：{scope['strategy']}", data={
                "mode": scope["mode"],
                "requirementCount": len(scope.get("requirements") or []),
                "hasRequirementText": bool(scope.get("requirementText")),
            })
            snapshot["recognitionTrace"] = trace
            snapshot["aiAnalysis"] = await self._analyze_with_ai(snapshot, scope, user_id)
            snapshot["recognitionTrace"] = trace
            status = "成功"
            error = ""
        except Exception as exc:
            friendly_error = _friendly_recognition_error(exc)
            self._add_trace(trace, "failed", "failed", friendly_error[:1000])
            snapshot = {
                "environment": {
                    "id": environment.id,
                    "name": environment.name,
                    "webUrl": environment.web_url or "",
                },
                "errorType": exc.__class__.__name__,
                "scope": {
                    "mode": scope_mode if scope_mode in {"full", "incremental"} else "full",
                    "requirements": [],
                    "requirementText": requirement_text or "",
                },
                "recognitionTrace": trace,
            }
            status = "失败"
            error = friendly_error[:3000]

        item = UISnapshot(
            id=str(uuid.uuid4()),
            project_id=environment.project_id,
            environment_id=environment.id,
            account_id=account.id if account else None,
            status=status,
            summary=self._summary(snapshot, status=status, error=error),
            snapshot_json=json.dumps(snapshot, ensure_ascii=False),
            error=error,
            created_at=started,
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return self._to_dict(item)

    async def _environment(self, environment_id: str, user_id: str) -> EnvironmentConfig:
        environment = (await self.db.execute(select(EnvironmentConfig).where(
            EnvironmentConfig.id == environment_id
        ))).scalar_one_or_none()
        if not environment:
            raise ValueError("测试环境不存在")
        await verify_project_owner(self.db, environment.project_id, user_id)
        environment_type = (getattr(environment, "environment_type", "") or "Web").strip()
        if environment_type == "APP":
            raise ValueError("当前环境是 APP 环境，系统识别暂仅支持 Web 环境")
        if not environment.web_url:
            raise ValueError("当前 Web 环境未配置 Web 地址，无法识别系统")
        return environment

    async def _account(self, environment: EnvironmentConfig, account_id: str | None) -> TestAccount | None:
        query = select(TestAccount).where(TestAccount.environment_id == environment.id)
        if account_id:
            query = query.where(TestAccount.id == account_id)
            query = query.order_by(TestAccount.created_at.asc()).limit(1)
            account = (await self.db.execute(query)).scalar_one_or_none()
            if not account:
                raise ValueError("所选账号不属于当前测试环境")
            return account
        # 未指定账号时：优先用管理员账号（高权限，能看到完整菜单/页面），
        # 避免用业务人员账号识别导致菜单采集不全、后续自动化定位不准。
        admin_query = select(TestAccount).where(
            TestAccount.environment_id == environment.id,
            TestAccount.is_admin.is_(True),
        ).order_by(TestAccount.created_at.asc()).limit(1)
        account = (await self.db.execute(admin_query)).scalar_one_or_none()
        if account:
            return account
        # 没有管理员账号，退而取第一个账号
        fallback = select(TestAccount).where(
            TestAccount.environment_id == environment.id,
        ).order_by(TestAccount.created_at.asc()).limit(1)
        return (await self.db.execute(fallback)).scalar_one_or_none()

    async def _build_scope(
        self,
        project_id: str,
        *,
        mode: str,
        requirement_ids: list[str],
        requirement_text: str,
    ) -> dict[str, Any]:
        normalized_mode = "incremental" if mode == "incremental" else "full"
        query = select(Requirement).where(Requirement.project_id == project_id)
        if requirement_ids:
            query = query.where(Requirement.id.in_(requirement_ids))
        query = query.order_by(Requirement.created_at.asc()).limit(60)
        requirements = (await self.db.execute(query)).scalars().all()
        return {
            "mode": normalized_mode,
            "requirements": requirement_records(requirements),
            "requirementText": (requirement_text or "").strip()[:8000],
            "strategy": (
                "只识别需求相关页面和元素；菜单树仅作为定位和导航上下文"
                if normalized_mode == "incremental"
                else "识别已采集到的系统入口、菜单、页面和元素"
            ),
        }

    async def _analyze_with_ai(self, snapshot: dict[str, Any], scope: dict[str, Any], user_id: str) -> dict[str, Any]:
        payload = {
            "scope": scope,
            "environment": snapshot.get("environment") or {},
            "loginResult": snapshot.get("loginResult") or {},
            "loginPage": self._trim_page(snapshot.get("loginPage") or {}, menu_limit=0),
            "appPage": self._trim_page(snapshot.get("appPage") or {}, menu_limit=120),
        }
        try:
            result = await AIService().analyze_system_recognition(payload, user_id)
            trace = snapshot.get("recognitionTrace")
            if isinstance(trace, list):
                self._add_trace(trace, "ai_analysis", "success", "AI 已完成系统识别结构化分析", data={
                    "pageObjectCount": len(result.get("pageObjects") or []),
                    "moduleCount": len(result.get("relevantModules") or []),
                    "questionCount": len(result.get("unresolvedQuestions") or []),
                })
            return result
        except Exception as exc:
            trace = snapshot.get("recognitionTrace")
            if isinstance(trace, list):
                self._add_trace(trace, "ai_analysis", "skipped", f"AI 系统识别未完成：{str(exc)[:300]}")
            return {
                "scopeMode": scope.get("mode", "full"),
                "relevantModules": [],
                "pageObjects": [],
                "navigationPlan": [],
                "scriptGuidance": [
                    "AI 系统识别未完成，脚本生成将回退使用规则采集到的 loginInputs、menus、buttons、tables。",
                ],
                "unresolvedQuestions": [f"AI 系统识别失败：{str(exc)[:300]}"],
                "status": "skipped",
            }

    def _trim_page(self, page: dict[str, Any], *, menu_limit: int) -> dict[str, Any]:
        return {
            "url": page.get("url") or "",
            "title": page.get("title") or "",
            "componentHints": page.get("componentHints") or {},
            "inputs": (page.get("inputs") or [])[:40],
            "buttons": (page.get("buttons") or [])[:60],
            "menus": (page.get("menus") or [])[:menu_limit],
            "tables": (page.get("tables") or [])[:30],
        }

    async def _take_screenshot(self, page, environment_id: str, step: str) -> str | None:
        """对当前页面截图，返回可访问的 /uploads/... URL。失败返回 None（不影响主流程）。

        截图让识别过程可视化：能事后看到每步实际打开了什么页面、采集到什么，
        尤其在采集为空时，截图是判断"页面没打开/渲染没完成/表单在 iframe"的关键依据。
        """
        try:
            screenshot_dir = Path(settings.UPLOAD_DIR) / "recognition-screenshots"
            screenshot_dir.mkdir(parents=True, exist_ok=True)
            filename = f"{environment_id}-{step}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.png"
            filepath = screenshot_dir / filename
            await page.screenshot(path=str(filepath), full_page=True, timeout=8000)
            # 转成 /uploads/... URL（StaticFiles 挂载在 main.py）
            rel = filepath.resolve().relative_to(Path(settings.UPLOAD_DIR).resolve())
            return "/uploads/" + str(rel).replace("\\", "/")
        except Exception:
            return None

    async def _expand_all_menus(self, page, *, trace: list[dict[str, Any]]) -> int:
        """主动展开所有可折叠的子菜单，确保采集时能拿到完整的嵌套树。

        Element UI 的 .el-submenu 折叠时子级 <ul> 不在 DOM 或 display:none。
        注意：.el-submenu__title 的 click 是"切换"展开/折叠，不是只展开。
        因此必须先判断当前是否已展开（父级 .el-submenu 含 is-opened/is-active），
        只点击未展开的，避免把已展开的菜单又折叠回去。
        展开后子级可能露出新的 submenu，迭代多轮直到没有新的可展开项。
        """
        total_expanded = 0
        for iteration in range(5):  # 最多 5 轮，对应最多 5 级菜单深度
            round_expanded = 0
            # 通过 evaluate 找出所有"未展开"的可折叠菜单 title（返回其在 DOM 的索引）
            try:
                to_expand = await page.evaluate(
                    """(selectors) => {
                      // 收集所有 submenu title 元素，只保留"可见且其父 submenu 未展开"的
                      const titles = [];
                      for (const sel of selectors) {
                        document.querySelectorAll(sel).forEach(el => {
                          // 找最近的 submenu 祖先，判断是否已展开
                          const submenu = el.closest('.el-submenu, .ant-menu-submenu');
                          if (!submenu) return;
                          const opened = submenu.classList.contains('is-opened')
                                      || submenu.classList.contains('is-active')
                                      || submenu.classList.contains('ant-menu-submenu-open')
                                      || submenu.getAttribute('aria-expanded') === 'true';
                          if (opened) return;  // 已展开，跳过
                          // 检查 title 自身是否可见
                          const rect = el.getBoundingClientRect();
                          const style = window.getComputedStyle(el);
                          const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                                       && style.display !== 'none' && style.visibility !== 'hidden';
                          if (!visible) return;
                          // 用唯一标记便于定位
                          const mark = 'aitestlink-expand-' + titles.length;
                          el.setAttribute('data-expand-mark', mark);
                          titles.push(mark);
                        });
                      }
                      return titles;
                    }""",
                    [".el-submenu__title", ".ant-menu-submenu-title"],
                )
            except Exception:
                to_expand = []
            if not to_expand:
                break  # 没有新的可展开菜单，结束
            for mark in to_expand[:80]:
                try:
                    locator = page.locator(f"[data-expand-mark='{mark}']").first
                    if await locator.count() == 0:
                        continue
                    await locator.click(timeout=1500)
                    await page.wait_for_timeout(200)
                    round_expanded += 1
                    # 清除标记，避免重复
                    await locator.evaluate("(el) => el.removeAttribute('data-expand-mark')")
                except Exception:
                    continue
            total_expanded += round_expanded
            if round_expanded == 0:
                break
            await page.wait_for_timeout(300)
        self._add_trace(trace, "expand_menus", "success" if total_expanded else "skipped",
                        f"主动展开子菜单：共 {total_expanded} 个（仅展开未展开项，不重复切换）")
        return total_expanded

    async def _scroll_menu_container(self, page, *, trace: list[dict[str, Any]]) -> None:
        """逐步滚动菜单容器，确保滚动区外/懒加载的菜单也进入 DOM。

        很多系统的侧边菜单在固定高度容器里，超出视口的菜单可能懒加载。
        这里找到菜单滚动容器并逐步滚到底，每段等待渲染。
        """
        scrolled = False
        try:
            # 找到菜单容器（el-menu 或其 overflow:auto 的父级）
            containers = await page.evaluate(
                """() => {
                  const candidates = [];
                  // 直接是滚动容器的 el-menu
                  document.querySelectorAll('.el-menu, .ant-menu, [class*="sidebar"], [class*="menu-wrap"], [class*="menu-container"]').forEach(el => {
                    const style = window.getComputedStyle(el);
                    const overflow = style.overflowY || style.overflow;
                    if (el.scrollHeight > el.clientHeight + 10 && (overflow === 'auto' || overflow === 'scroll')) {
                      candidates.push({
                        selector: el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '',
                        scrollHeight: el.scrollHeight,
                        clientHeight: el.clientHeight
                      });
                    }
                  });
                  // 也检查 el-menu 的父级
                  document.querySelectorAll('.el-menu').forEach(menu => {
                    let parent = menu.parentElement;
                    for (let depth = 0; depth < 3 && parent; depth++) {
                      const style = window.getComputedStyle(parent);
                      const overflow = style.overflowY || style.overflow;
                      if (parent.scrollHeight > parent.clientHeight + 10 && (overflow === 'auto' || overflow === 'scroll')) {
                        candidates.push({
                          selector: parent.className ? '.' + String(parent.className).trim().split(/\\s+/)[0] : '',
                          scrollHeight: parent.scrollHeight,
                          clientHeight: parent.clientHeight
                        });
                        break;
                      }
                      parent = parent.parentElement;
                    }
                  });
                  return candidates.slice(0, 3);
                }"""
            )
            for container in containers or []:
                selector = container.get("selector") or ""
                if not selector:
                    continue
                try:
                    el = page.locator(selector).first
                    if await el.count() == 0:
                        continue
                    scroll_height = container.get("scrollHeight") or 0
                    client_height = container.get("clientHeight") or 0
                    steps = min(20, max(3, (scroll_height - client_height) // 300 + 1))
                    for step in range(steps):
                        await el.evaluate(f"(el, i) => el.scrollTop = (el.scrollHeight) * (i+1) / {steps}", step)
                        await page.wait_for_timeout(200)
                    scrolled = True
                except Exception:
                    continue
        except Exception:
            pass
        self._add_trace(trace, "scroll_menu", "success" if scrolled else "skipped",
                        "已滚动菜单容器采集完整菜单" if scrolled else "菜单容器无需滚动")

    async def _recognize_with_playwright(
        self,
        environment: EnvironmentConfig,
        account: TestAccount | None,
        *,
        headed: bool,
        trace: list[dict[str, Any]],
    ) -> dict:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            launch_options = {"headless": not headed, "slow_mo": 300 if headed else 0}
            try:
                browser = await p.chromium.launch(**launch_options)
            except Exception as exc:
                system_browser = _system_browser_executable()
                if not system_browser or "playwright install" not in str(exc).lower():
                    raise
                self._add_trace(trace, "browser_fallback", "success", "Playwright 浏览器缺失，已切换为本机 Chrome/Edge 浏览器", data={"executablePath": system_browser})
                browser = await p.chromium.launch(executable_path=system_browser, **launch_options)
            context = await browser.new_context(ignore_https_errors=True)
            page = await context.new_page()
            page.set_default_timeout(30000)
            screenshots: list[dict[str, Any]] = []
            # domcontentloaded：等 DOM 解析完、JS 开始执行，比 commit 更可靠
            # （commit 只等响应头，SPA 页面 JS 还没渲染就采集会全空）。
            try:
                await page.goto(environment.web_url, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                # domcontentloaded 超时退化为 commit（至少打开连接）
                await page.goto(environment.web_url, wait_until="commit", timeout=30000)
            self._add_trace(trace, "open_url", "success", "已打开环境地址", url=page.url)
            await self._wait_for_initial_form(page)
            # 采集登录页前，必须确认表单真的渲染出来了：等可见的 input 出现。
            # 很多 SPA 登录页打开后是白屏，JS 异步渲染表单，_wait_for_initial_form
            # 只轮询元素存在还不够（可能 offsetWidth=0 仍在布局中），这里再强化等待。
            login_page = await self._collect_page(page)
            # 采集为空时反复重试，直到采到表单元素或超时，避免登录页数据丢失。
            retry = 0
            while not (login_page.get("inputs") or login_page.get("buttons")) and retry < 6:
                retry += 1
                self._add_trace(trace, "collect_entry_page", "warning", f"登录页表单尚未渲染，第 {retry} 次等待重试", url=page.url)
                await page.wait_for_timeout(2500)
                # 主动等可见 input（networkidle 不可靠，用 DOM 等待更稳）
                try:
                    await page.wait_for_selector("input:visible, textarea:visible", timeout=2500)
                except Exception:
                    pass
                login_page = await self._collect_page(page)
            login_screenshot = await self._take_screenshot(page, environment.id, "login_page")
            if login_screenshot:
                screenshots.append({"step": "login_page", "label": "登录页", "url": login_screenshot, "takenAt": page.url})
            self._add_trace(trace, "collect_entry_page", "success", "已采集入口页面 DOM", url=login_page.get("url") or page.url, data={
                "title": login_page.get("title") or "",
                "inputCount": len(login_page.get("inputs") or []),
                "buttonCount": len(login_page.get("buttons") or []),
                "iframeCount": len(login_page.get("frames") or []),
                "frameCount": len(page.frames),
                "screenshot": login_screenshot,
            })

            login_result = {"attempted": False, "success": False, "reason": "未配置测试账号"}
            if account:
                login_result = await self._try_login(page, account, environment, trace=trace)
            else:
                self._add_trace(trace, "login", "skipped", "未配置测试账号，跳过自动登录")

            await page.wait_for_timeout(5000)
            # 采集前主动展开所有子菜单 + 滚动菜单容器，确保采到完整的嵌套菜单树
            await self._expand_all_menus(page, trace=trace)
            await self._scroll_menu_container(page, trace=trace)
            app_page = await self._collect_page(page)
            after_login_screenshot = await self._take_screenshot(page, environment.id, "after_login")
            if after_login_screenshot:
                screenshots.append({"step": "after_login", "label": "登录后", "url": after_login_screenshot, "takenAt": page.url})
            self._add_trace(trace, "collect_app_page", "success", "已采集登录后/当前页面 DOM", url=app_page.get("url") or page.url, data={
                "title": app_page.get("title") or "",
                "inputCount": len(app_page.get("inputs") or []),
                "buttonCount": len(app_page.get("buttons") or []),
                "menuCount": len(app_page.get("menus") or []),
                "tableCount": len(app_page.get("tables") or []),
                "frameCount": len(page.frames),
                "screenshot": after_login_screenshot,
            })
            await browser.close()
            return {
                "screenshots": screenshots,
                "environment": {
                    "id": environment.id,
                    "name": environment.name,
                    "webUrl": environment.web_url or "",
                },
                "loginPage": login_page,
                "loginResult": login_result,
                "appPage": app_page,
            }

    async def _try_login(self, page, account: TestAccount, environment: EnvironmentConfig, *, trace: list[dict[str, Any]]) -> dict:
        encrypted = account.password or ""
        password = decrypt_value(encrypted[4:] if encrypted.startswith("enc:") else encrypted)
        await self._ensure_login_form_open(page, trace=trace)
        # 验证码是否必填严格依据环境配置：captcha_required 为 False 时，
        # 识别及后续所有测试环节的登录一律忽略验证码。
        captcha_required = environment.captcha_required is not False

        # Agent 式智能填写：扫描输入框、按特征分类、不依赖固定 placeholder 精确匹配。
        # 分不清时按"账号在前、密码在后、type=password 必为密码"推断；填不上也不抛异常。
        fill_result = await self._smart_fill_login(
            page, account.username, password,
            environment.captcha_code or "", captcha_required,
            trace=trace,
        )

        before_url = page.url
        submit_locator = await self._click_login(page)
        if not submit_locator:
            # 找不到登录按钮也不直接报错中断——记录后判定本次登录失败，
            # 让识别流程继续采集当前页面（至少能拿到 DOM 结构）。
            self._add_trace(trace, "submit_login", "failed",
                            f"未找到登录按钮。当前页面元素：{await self._describe_login_candidates(page)}")
            submit_locator = None
        else:
            self._add_trace(trace, "submit_login", "success", "已点击登录按钮", url=page.url, data={"locator": submit_locator})
            try:
                await page.wait_for_function(
                    "(before) => location.href !== before || !!document.querySelector('.el-menu,.ant-menu,[role=menubar]')",
                    arg=before_url,
                    timeout=20000,
                )
            except Exception:
                pass

        success = page.url != before_url or await page.locator(".el-menu,.ant-menu,[role=menubar]").count() > 0
        self._add_trace(trace, "check_login_result", "success" if success else "failed", "登录结果已判断" if success else "未确认登录成功", url=page.url, data={
            "beforeUrl": before_url,
            "afterUrl": page.url,
            "success": success,
            "filled": fill_result.get("filled"),
        })
        return {
            "attempted": True,
            "success": bool(success),
            "accountRole": account.role or account.name,
            "beforeUrl": before_url,
            "afterUrl": page.url,
            # 登录表单定位器：供后续脚本生成直接复用，无需再猜测字段定位
            "loginForm": {
                "accountLocator": fill_result.get("accountLocator"),
                "passwordLocator": fill_result.get("passwordLocator"),
                "captchaRequired": captcha_required,
                "captchaLocator": fill_result.get("captchaLocator"),
                "submitLocator": submit_locator,
            },
        }

    async def _ensure_login_form_open(self, page, *, trace: list[dict[str, Any]] | None = None) -> None:
        if await self._has_visible_password_input(page):
            self._add_trace(trace, "detect_login_form", "success", "当前页面已存在可见登录表单", url=page.url)
            return

        entry_selectors = [
            "button:has-text('重新登录')",
            ".el-button:has-text('重新登录')",
            "[role='button']:has-text('重新登录')",
            "text=重新登录",
            ".login-btn:has-text('登录')",
            "button:has-text('登录')",
            "a:has-text('登录')",
            "[role='button']:has-text('登录')",
            "text=登录",
        ]
        for frame in page.frames:
            for selector in entry_selectors:
                locator = frame.locator(selector).first
                try:
                    if await locator.count() > 0 and await locator.is_visible() and await locator.is_enabled():
                        self._add_trace(trace, "open_login_form", "running", f"尝试点击登录入口：{selector}", url=page.url)
                        await locator.click()
                        if await self._wait_for_visible_password_input(page, timeout_ms=5000):
                            self._add_trace(trace, "open_login_form", "success", f"已打开登录表单：{selector}", url=page.url)
                            return
                except Exception:
                    continue

        if await self._wait_for_visible_password_input(page, timeout_ms=3000):
            self._add_trace(trace, "open_login_form", "success", "等待后发现登录表单", url=page.url)
            return
        self._add_trace(trace, "open_login_form", "failed", "未能自动打开登录表单", url=page.url)

    async def _has_visible_password_input(self, page) -> bool:
        for frame in page.frames:
            try:
                locator = frame.locator("input[type='password'], input[placeholder*='密码']").first
                if await locator.count() > 0 and await locator.is_visible():
                    return True
            except Exception:
                continue
        return False

    async def _wait_for_visible_password_input(self, page, *, timeout_ms: int) -> bool:
        elapsed = 0
        while elapsed < timeout_ms:
            if await self._has_visible_password_input(page):
                return True
            await page.wait_for_timeout(250)
            elapsed += 250
        return False

    async def _wait_for_initial_form(self, page) -> None:
        deadline_ms = 30000
        interval_ms = 500
        elapsed = 0
        while elapsed < deadline_ms:
            if await self._has_form_candidate(page):
                return
            await page.wait_for_timeout(interval_ms)
            elapsed += interval_ms
        await page.wait_for_timeout(1000)

    async def _has_form_candidate(self, page) -> bool:
        for frame in page.frames:
            try:
                if await frame.locator("input, textarea, select, button, [role='button']").count() > 0:
                    return True
            except Exception:
                continue
        return False

    async def _fill_first(
        self,
        page,
        selectors: list[str],
        value: str,
        *,
        preferred_frame=None,
        required: bool = True,
        field_role: str = "",
    ):
        """填写第一个匹配字段。返回 (frame, matched_selector)，未匹配返回 (None, None)。"""
        frames = self._ordered_frames(page, preferred_frame)
        for frame in frames:
            for selector in selectors:
                locator = frame.locator(selector).first
                try:
                    if await locator.count() > 0 and await locator.is_visible() and await locator.is_enabled():
                        await locator.fill(value)
                        return frame, selector
                except Exception:
                    continue
            dynamic = await self._fill_dynamic_input(frame, value, field_role=field_role)
            if dynamic:
                return frame, f"dynamic:{field_role}"
        if required:
            raise RuntimeError(
                f"未找到可填写字段，候选定位器：{', '.join(selectors)}。"
                f"当前页面元素：{await self._describe_login_candidates(page)}"
            )
        return None, None

    def _ordered_frames(self, page, preferred_frame=None) -> list[Any]:
        frames = list(page.frames)
        if preferred_frame and preferred_frame in frames:
            return [preferred_frame] + [frame for frame in frames if frame != preferred_frame]
        return frames

    async def _fill_dynamic_input(self, frame, value: str, *, field_role: str) -> bool:
        handles = await frame.locator("input, textarea").element_handles()
        scored: list[tuple[int, Any]] = []
        for handle in handles:
            try:
                meta = await handle.evaluate(
                    """(el) => {
                      const style = window.getComputedStyle(el);
                      const rect = el.getBoundingClientRect();
                      const text = [
                        el.getAttribute('placeholder') || '',
                        el.getAttribute('aria-label') || '',
                        el.getAttribute('name') || '',
                        el.getAttribute('id') || '',
                        el.getAttribute('class') || '',
                        el.getAttribute('type') || ''
                      ].join(' ').toLowerCase();
                      return {
                        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
                        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' || el.readOnly,
                        type: (el.getAttribute('type') || '').toLowerCase(),
                        text,
                        top: rect.top,
                        left: rect.left
                      };
                    }"""
                )
                if not meta.get("visible") or meta.get("disabled"):
                    continue
                text = meta.get("text") or ""
                input_type = meta.get("type") or ""
                if input_type in {"checkbox", "radio", "hidden", "submit", "button"}:
                    continue
                if field_role == "password":
                    if input_type == "password" or "密码" in text or "password" in text:
                        score = 100
                    else:
                        # 放宽：非密码特征的 text 输入框也给弱候选分，
                        # 让上层智能逻辑（_smart_fill_login）有机会按数量/位置推断。
                        score = 30
                elif field_role == "captcha":
                    score = 100 if "验证码" in text or "captcha" in text or "verify" in text else 20
                else:
                    if input_type == "password" or "密码" in text or "验证码" in text or "captcha" in text:
                        score = -1
                    else:
                        score = 80
                        if any(keyword in text for keyword in ["员工", "账号", "用户", "手机", "login", "user", "account", "phone"]):
                            score = 120
                if score >= 0:
                    scored.append((score, handle))
            except Exception:
                continue
        if not scored:
            return False
        scored.sort(key=lambda item: item[0], reverse=True)
        try:
            await scored[0][1].fill(value)
            return True
        except Exception:
            return False

    def _classify_login_field(self, meta: dict[str, Any]) -> tuple[str, int]:
        """根据输入框的综合属性判定它最可能的角色。

        返回 (role, score)，role 为 account/password/captcha/other。
        综合考虑 type、placeholder、name、id、aria-label、class 等特征，
        而非依赖单一关键词精确匹配。
        """
        text = " ".join(str(meta.get(k) or "") for k in
                        ("placeholder", "ariaLabel", "aria_label", "name", "id", "className", "class")).lower()
        input_type = str(meta.get("type") or "").lower()

        # 排除明显非文本输入的类型
        if input_type in {"checkbox", "radio", "hidden", "submit", "button", "file", "image", "range", "color"}:
            return "other", -1

        # ---- 密码 ----
        if input_type == "password":
            return "password", 200
        pwd_kw = ("密码", "password", "passwd", "pwd", "passwort", "mima")
        if any(k in text for k in pwd_kw):
            return "password", 150

        # ---- 验证码 ----
        cap_kw = ("验证码", "captcha", "verify", "verification", "security code", "yanzhengma")
        if any(k in text for k in cap_kw):
            return "captcha", 150

        # ---- 账号 ----
        acc_kw = ("员工", "账号", "账户", "用户名", "用户", "手机", "邮箱", "工号",
                  "account", "username", "user", "login", "phone", "mobile", "email", "employee", "staff", "userid", "user_id", "loginname")
        acc_score = 0
        for k in acc_kw:
            if k in text:
                acc_score = max(acc_score, 140)
        if acc_score > 0:
            return "account", acc_score

        # ---- 兜底：无法明确分类的 text 输入框 ----
        # 给一个中等分作为"可能是账号"的弱候选，交给上层智能逻辑按数量/位置决策
        return "account", 50

    async def _collect_login_inputs(self, frame) -> list[dict[str, Any]]:
        """扫描 frame 中所有 input/textarea，收集每个的完整属性 + 分类结果。

        返回候选列表，每项含 meta + role + score + handle。
        过滤掉不可见/禁用的元素（Element UI 的隐藏包装会被排除）。
        """
        handles = await frame.locator("input, textarea").element_handles()
        candidates: list[dict[str, Any]] = []
        for idx, handle in enumerate(handles):
            try:
                meta = await handle.evaluate(
                    """(el) => {
                      const rect = el.getBoundingClientRect();
                      const style = window.getComputedStyle(el);
                      return {
                        tag: el.tagName.toLowerCase(),
                        type: el.getAttribute('type') || '',
                        placeholder: el.getAttribute('placeholder') || '',
                        name: el.getAttribute('name') || '',
                        id: el.getAttribute('id') || '',
                        ariaLabel: el.getAttribute('aria-label') || '',
                        className: el.getAttribute('class') || '',
                        visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
                                 && style.display !== 'none'
                                 && style.visibility !== 'hidden'
                                 && parseFloat(style.opacity || '1') > 0,
                        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true' || el.readOnly,
                        top: rect.top,
                        left: rect.left
                      };
                    }"""
                )
            except Exception:
                continue
            if not meta.get("visible") or meta.get("disabled"):
                continue
            role, score = self._classify_login_field(meta)
            if score < 0:
                continue
            candidates.append({"meta": meta, "role": role, "score": score, "handle": handle, "index": idx})
        # 按页面位置排序（上→下、左→右），便于"账号在前密码在后"的位置推断
        candidates.sort(key=lambda c: (round(c["meta"].get("top", 0) / 5), c["meta"].get("left", 0)))
        return candidates

    def _describe_locator(self, meta: dict[str, Any]) -> str:
        """根据输入框属性生成人类可读的定位器描述，供 loginForm 回传。"""
        parts = []
        if meta.get("placeholder"):
            parts.append(f"placeholder={meta['placeholder']}")
        if meta.get("id"):
            parts.append(f"id={meta['id']}")
        if meta.get("name"):
            parts.append(f"name={meta['name']}")
        if meta.get("ariaLabel"):
            parts.append(f"aria-label={meta['ariaLabel']}")
        if meta.get("type"):
            parts.append(f"type={meta['type']}")
        return " | ".join(parts) if parts else "input(未识别特征)"

    async def _smart_fill_login(
        self, page, account: str, password: str, captcha_code: str, captcha_required: bool,
        *, preferred_frame=None, trace: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Agent 式智能填写登录表单。

        先扫描输入框，按角色分组，选出最可能的账号/密码/验证码框并填写。
        分不清时按"账号在前、密码在后、type=password 一定是密码"推断。
        全程不抛异常；填不上返回 failed，让上层尝试提交看结果。
        """
        frames = self._ordered_frames(page, preferred_frame)
        result: dict[str, Any] = {
            "accountLocator": None, "passwordLocator": None,
            "captchaRequired": captcha_required, "captchaLocator": None,
            "filled": False, "reason": "",
        }
        for frame in frames:
            candidates = await self._collect_login_inputs(frame)
            if not candidates:
                continue

            # 按角色分组，每组取最高分
            by_role: dict[str, list[dict[str, Any]]] = {"account": [], "password": [], "captcha": []}
            for c in candidates:
                by_role.setdefault(c["role"], []).append(c)
            for r in by_role:
                by_role[r].sort(key=lambda c: c["score"], reverse=True)

            account_cand = by_role.get("account") or []
            password_cand = by_role.get("password") or []
            captcha_cand = by_role.get("captcha") or []

            # 特殊情况：没有明确密码框，但有多个 account 候选 →
            # 按"账号在前、密码在后"推断：第一个是账号，第二个（如果有）可能也是账号或密码。
            # 若恰好2个候选且都无明确密码特征，则前者账号后者密码。
            if not password_cand and len(account_cand) >= 2:
                password_cand = [account_cand[-1]]  # 最后一个当密码
                account_cand = account_cand[:-1]

            if not account_cand:
                result["reason"] = f"未找到账号输入框，候选：{[c['role'] for c in candidates]}"
                continue

            # 填账号
            acc = account_cand[0]
            try:
                await acc["handle"].fill(account)
                result["accountLocator"] = self._describe_locator(acc["meta"])
            except Exception as e:
                result["reason"] = f"填写账号失败：{e}"
                continue

            # 填密码
            if password_cand:
                pwd = password_cand[0]
                try:
                    await pwd["handle"].fill(password)
                    result["passwordLocator"] = self._describe_locator(pwd["meta"])
                except Exception:
                    pass

            # 填验证码（仅当配置要求）
            if captcha_required and captcha_code and captcha_cand:
                cap = captcha_cand[0]
                try:
                    await cap["handle"].fill(captcha_code)
                    result["captchaLocator"] = self._describe_locator(cap["meta"])
                except Exception:
                    pass

            result["filled"] = True
            self._add_trace(trace, "smart_fill_login", "success",
                            f"智能填写完成：账号={result['accountLocator'] or 'N/A'}；密码={'已填' if result['passwordLocator'] else 'N/A'}",
                            data={"frameUrl": getattr(frame, "url", ""),
                                  "candidateRoles": [(c["role"], c["score"]) for c in candidates],
                                  "account": result["accountLocator"],
                                  "password": result["passwordLocator"],
                                  "captcha": result["captchaLocator"]})
            return result

        result["reason"] = result["reason"] or "所有 frame 均无可填写输入框"
        self._add_trace(trace, "smart_fill_login", "failed", result["reason"])
        return result

    async def _click_login(self, page, *, preferred_frame=None):
        """点击登录按钮。返回匹配的 selector，未匹配返回 None。"""
        frames = self._ordered_frames(page, preferred_frame)
        selectors = [
            "button:has-text('登录')",
            "[role='button']:has-text('登录')",
            ".el-button:has-text('登录')",
            ".ant-btn:has-text('登录')",
            "input[type='submit']",
            "button[type='submit']",
        ]
        for frame in frames:
            for selector in selectors:
                locator = frame.locator(selector).first
                try:
                    if await locator.count() > 0 and await locator.is_visible() and await locator.is_enabled():
                        await locator.click()
                        return selector
                except Exception:
                    continue
        return None

    async def _describe_login_candidates(self, page) -> str:
        pages: list[dict[str, Any]] = []
        for idx, frame in enumerate(page.frames):
            try:
                pages.append(await frame.evaluate(
                    """(idx) => {
                      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                      const item = (el) => ({
                        tag: el.tagName.toLowerCase(),
                        text: (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
                        placeholder: el.getAttribute('placeholder') || '',
                        type: el.getAttribute('type') || '',
                        name: el.getAttribute('name') || '',
                        id: el.getAttribute('id') || '',
                        className: el.getAttribute('class') || '',
                        visible: visible(el)
                      });
                      return {
                        frameIndex: idx,
                        url: location.href,
                        title: document.title,
                        inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(item).slice(0, 20),
                        buttons: Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).map(item).slice(0, 20)
                      };
                    }""",
                    idx,
                ))
            except Exception:
                continue
        return json.dumps(pages[:5], ensure_ascii=False)[:2000]

    async def _collect_page(self, page) -> dict:
        """采集页面 DOM。先采主 frame，再遍历子 frame 合并 inputs/buttons/menus/tables。

        很多企业系统的登录表单或业务页面在 iframe 里，主 frame 采不到。
        这里合并所有可见 frame 的元素，避免采集为空。
        """
        main = await self._collect_frame(page.main_frame)
        # 遍历子 frame，合并元素（主 frame 已含，跳过）
        all_inputs = list(main.get("inputs") or [])
        all_buttons = list(main.get("buttons") or [])
        all_menus = list(main.get("menus") or [])
        all_tables = list(main.get("tables") or [])
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            try:
                sub = await self._collect_frame(frame)
            except Exception:
                continue
            for key, target in (("inputs", all_inputs), ("buttons", all_buttons), ("menus", all_menus), ("tables", all_tables)):
                for item in (sub.get(key) or []):
                    if item not in target:
                        target.append(item)
        main["inputs"] = all_inputs[:120]
        main["buttons"] = all_buttons[:80]
        main["menus"] = all_menus
        main["tables"] = all_tables[:20]
        return main

    async def _collect_frame(self, frame) -> dict:
        """在单个 frame 内采集 DOM（inputs/buttons/menus/tables/frames）。"""
        return await frame.evaluate(
            """() => {
              const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
              const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
              const simple = (el) => ({
                tag: el.tagName.toLowerCase(),
                text: txt(el).slice(0, 120),
                title: el.getAttribute('title') || '',
                placeholder: el.getAttribute('placeholder') || '',
                type: el.getAttribute('type') || '',
                role: el.getAttribute('role') || '',
                className: el.getAttribute('class') || '',
                id: el.getAttribute('id') || '',
                name: el.getAttribute('name') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
                required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true' || el.getAttribute('required') === 'required',
                visible: visible(el)
              });
              const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(simple).slice(0, 120);
              const buttons = Array.from(document.querySelectorAll('button, [role="button"], .el-button, .ant-btn')).map(simple).filter(x => x.visible || x.text).slice(0, 80);

              function menuNode(li) {
                const titleEl = li.querySelector(':scope > .el-submenu__title span[title], :scope > span[title], :scope > div span[title], :scope > span');
                const title = titleEl ? (titleEl.getAttribute('title') || txt(titleEl)) : txt(li).slice(0, 40);
                const children = Array.from(li.querySelectorAll(':scope > ul > li')).map(menuNode).filter(x => x.title);
                return {
                  title,
                  className: li.getAttribute('class') || '',
                  role: li.getAttribute('role') || '',
                  visible: visible(li),
                  selectorHint: title ? `span[title="${title}"]` : '',
                  children
                };
              }
              const menuRoots = Array.from(document.querySelectorAll('.el-menu.sk-menu__container, .el-menu[role="menubar"], .ant-menu, [role="menubar"]')).slice(0, 4);
              const menus = menuRoots.flatMap(root => Array.from(root.querySelectorAll(':scope > li')).map(menuNode)).filter(x => x.title);
              const tables = Array.from(document.querySelectorAll('.el-table, .ant-table, table')).map((table) => {
                const columns = Array.from(table.querySelectorAll('th, .el-table__header-wrapper th, .ant-table-thead th')).map(th => txt(th)).filter(Boolean).slice(0, 40);
                return { className: table.getAttribute('class') || '', visible: visible(table), columns };
              }).slice(0, 20);
              return {
                url: location.href,
                title: document.title,
                componentHints: {
                  elementUI: !!document.querySelector('.el-input,.el-menu,.el-table,.el-button'),
                  antDesign: !!document.querySelector('.ant-input,.ant-menu,.ant-table,.ant-btn')
                },
                inputs,
                buttons,
                menus,
                tables,
                frames: Array.from(document.querySelectorAll('iframe')).map((frame) => ({
                  src: frame.getAttribute('src') || '',
                  title: frame.getAttribute('title') || '',
                  name: frame.getAttribute('name') || '',
                  visible: visible(frame)
                })).slice(0, 20)
              };
            }"""
        )

    def _compact_context(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        app = snapshot.get("appPage") or {}
        login = snapshot.get("loginPage") or {}
        login_result = snapshot.get("loginResult") if isinstance(snapshot.get("loginResult"), dict) else {}
        ai_analysis = snapshot.get("aiAnalysis") if isinstance(snapshot.get("aiAnalysis"), dict) else {}
        scope = snapshot.get("scope") if isinstance(snapshot.get("scope"), dict) else {}
        login_form = login_result.get("loginForm") if isinstance(login_result.get("loginForm"), dict) else {}
        return {
            "recognizedAtUrl": app.get("url") or login.get("url"),
            "scopeMode": scope.get("mode") or ai_analysis.get("scopeMode") or "full",
            "componentHints": app.get("componentHints") or login.get("componentHints") or {},
            "aiAnalysis": ai_analysis,
            "relevantModules": ai_analysis.get("relevantModules") or [],
            "pageObjects": ai_analysis.get("pageObjects") or [],
            "navigationPlan": ai_analysis.get("navigationPlan") or [],
            "loginInputs": (login.get("inputs") or [])[:12],
            "loginButtons": (login.get("buttons") or [])[:12],
            "loginForm": login_form,
            "menus": (app.get("menus") or [])[:80],
            "buttons": (app.get("buttons") or [])[:30],
            "tables": (app.get("tables") or [])[:20],
        }

    def _summary(self, snapshot: dict[str, Any], *, status: str, error: str) -> str:
        if status != "成功":
            return f"识别失败：{error[:200]}"
        app = snapshot.get("appPage") or {}
        login = snapshot.get("loginPage") or {}
        login_result = snapshot.get("loginResult") if isinstance(snapshot.get("loginResult"), dict) else {}
        menus = app.get("menus") or []
        inputs = login.get("inputs") or []
        app_buttons = app.get("buttons") or []
        hints = app.get("componentHints") or login.get("componentHints") or {}
        ai_analysis = snapshot.get("aiAnalysis") if isinstance(snapshot.get("aiAnalysis"), dict) else {}
        page_objects = ai_analysis.get("pageObjects") or []
        ui = "Element UI" if hints.get("elementUI") else "Ant Design" if hints.get("antDesign") else "未识别到组件库"

        def count_total(nodes: list) -> int:
            total = 0
            for n in nodes:
                total += 1
                total += count_total(n.get("children") or [])
            return total

        menu_total = count_total(menus)

        # 登录结果
        if login_result.get("attempted"):
            login_text = "✓ 登录成功" if login_result.get("success") else "✗ 登录未成功"
        else:
            login_text = "— 未尝试登录（未配置账号）"

        # AI 分析状态
        ai_status = ai_analysis.get("status") or ""
        if page_objects:
            ai_text = f"AI 分析完成，识别页面对象 {len(page_objects)} 个"
        elif ai_status == "skipped":
            ai_text = "AI 分析已跳过（可重新识别重试）"
        else:
            ai_text = "AI 页面对象待完善"

        lines = [
            f"组件库：{ui}",
            f"自动登录：{login_text}",
            f"菜单：共 {menu_total} 个（{len(menus)} 个一级菜单）",
            f"登录页字段：输入框 {len(inputs)} 个",
            f"页面元素：按钮 {len(app_buttons)} 个",
            f"AI 分析：{ai_text}",
        ]
        return "\n".join(lines)

    def _to_dict(self, item: UISnapshot) -> dict:
        try:
            snapshot = json.loads(item.snapshot_json or "{}")
        except json.JSONDecodeError:
            snapshot = {}
        return {
            "id": item.id,
            "projectId": item.project_id,
            "environmentId": item.environment_id,
            "accountId": item.account_id,
            "status": item.status,
            "summary": item.summary or "",
            "snapshot": snapshot,
            "error": item.error or "",
            "createdAt": format_api_datetime(item.created_at),
            "updatedAt": format_api_datetime(item.updated_at),
        }

    def _add_trace(
        self,
        trace: list[dict[str, Any]] | None,
        step: str,
        status: str,
        message: str,
        *,
        url: str = "",
        data: dict[str, Any] | None = None,
    ) -> None:
        if trace is None:
            return
        trace.append({
            "step": step,
            "status": status,
            "message": message,
            "url": url,
            "data": data or {},
            "at": format_api_datetime(datetime.now(timezone.utc)),
        })
