from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.environment_config import EnvironmentConfig, TestAccount
from app.models.requirement import Requirement
from app.models.ui_snapshot import UISnapshot
from app.services.export_format import format_api_datetime
from app.services.ai_input_builder import requirement_records
from app.services.ai_service import AIService
from app.utils import decrypt_value, verify_project_owner


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
        account = await self._account(environment, account_id)
        started = datetime.now(timezone.utc)
        trace: list[dict[str, Any]] = []
        try:
            self._add_trace(trace, "prepare", "success", f"准备识别环境：{environment.name}", url=environment.web_url or "")
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
            self._add_trace(trace, "failed", "failed", str(exc)[:1000])
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
            error = str(exc)[:3000]

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
        if account_id and not account:
            raise ValueError("所选账号不属于当前测试环境")
        return account

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
            browser = await p.chromium.launch(headless=not headed, slow_mo=300 if headed else 0)
            context = await browser.new_context(ignore_https_errors=True)
            page = await context.new_page()
            page.set_default_timeout(30000)
            await page.goto(environment.web_url, wait_until="commit")
            self._add_trace(trace, "open_url", "success", "已打开环境地址", url=page.url)
            await self._wait_for_initial_form(page)
            login_page = await self._collect_page(page)
            self._add_trace(trace, "collect_entry_page", "success", "已采集入口页面 DOM", url=login_page.get("url") or page.url, data={
                "title": login_page.get("title") or "",
                "inputCount": len(login_page.get("inputs") or []),
                "buttonCount": len(login_page.get("buttons") or []),
                "iframeCount": len(login_page.get("frames") or []),
            })

            login_result = {"attempted": False, "success": False, "reason": "未配置测试账号"}
            if account:
                login_result = await self._try_login(page, account, environment, trace=trace)
            else:
                self._add_trace(trace, "login", "skipped", "未配置测试账号，跳过自动登录")

            await page.wait_for_timeout(5000)
            app_page = await self._collect_page(page)
            self._add_trace(trace, "collect_app_page", "success", "已采集登录后/当前页面 DOM", url=app_page.get("url") or page.url, data={
                "title": app_page.get("title") or "",
                "inputCount": len(app_page.get("inputs") or []),
                "buttonCount": len(app_page.get("buttons") or []),
                "menuCount": len(app_page.get("menus") or []),
                "tableCount": len(app_page.get("tables") or []),
            })
            await browser.close()
            return {
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
        username_selectors = [
            "input[placeholder='请输入员工号']",
            "input[placeholder*='员工号']",
            "input[placeholder*='手机号']",
            "input[placeholder*='登录账号']",
            "input[placeholder*='账号']",
            "input[placeholder*='用户名']",
            "input[type='text']",
            "input:not([type='password']):not([type='checkbox']):not([type='radio']):not([type='hidden']):not([type='submit'])",
            "textarea",
        ]
        password_selectors = [
            "input[placeholder='请输入密码']",
            "input[placeholder*='密码']",
            "input[type='password']",
        ]
        captcha_selectors = [
            "input[placeholder='请输入验证码']",
            "input[placeholder*='验证码']",
        ]
        username_frame = await self._fill_first(page, username_selectors, account.username, field_role="username")
        self._add_trace(trace, "fill_username", "success", "已填写账号字段", data={"frameUrl": getattr(username_frame, "url", "")})
        await self._fill_first(page, password_selectors, password, preferred_frame=username_frame, field_role="password")
        self._add_trace(trace, "fill_password", "success", "已填写密码字段", data={"frameUrl": getattr(username_frame, "url", "")})
        if environment.captcha_code:
            await self._fill_first(page, captcha_selectors, environment.captcha_code, preferred_frame=username_frame, required=False, field_role="captcha")
            self._add_trace(trace, "fill_captcha", "success", "已尝试填写验证码/占位值")
        else:
            self._add_trace(trace, "fill_captcha", "skipped", "环境未配置固定验证码/占位值")
        before_url = page.url
        login_clicked = await self._click_login(page, preferred_frame=username_frame)
        if not login_clicked:
            raise RuntimeError(f"未找到登录按钮。当前页面元素：{await self._describe_login_candidates(page)}")
        self._add_trace(trace, "submit_login", "success", "已点击登录按钮", url=page.url)
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
            "success": bool(success),
        })
        return {
            "attempted": True,
            "success": bool(success),
            "accountRole": account.role or account.name,
            "beforeUrl": before_url,
            "afterUrl": page.url,
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
        frames = self._ordered_frames(page, preferred_frame)
        for frame in frames:
            for selector in selectors:
                locator = frame.locator(selector).first
                try:
                    if await locator.count() > 0 and await locator.is_visible() and await locator.is_enabled():
                        await locator.fill(value)
                        return frame
                except Exception:
                    continue
            dynamic = await self._fill_dynamic_input(frame, value, field_role=field_role)
            if dynamic:
                return frame
        if required:
            raise RuntimeError(
                f"未找到可填写字段，候选定位器：{', '.join(selectors)}。"
                f"当前页面元素：{await self._describe_login_candidates(page)}"
            )
        return None

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
                    score = 100 if input_type == "password" or "密码" in text or "password" in text else -1
                elif field_role == "captcha":
                    score = 100 if "验证码" in text or "captcha" in text or "verify" in text else -1
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

    async def _click_login(self, page, *, preferred_frame=None) -> bool:
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
                        return True
                except Exception:
                    continue
        return False

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
        return await page.evaluate(
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
                visible: visible(el)
              });
              const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(simple).slice(0, 80);
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
        ai_analysis = snapshot.get("aiAnalysis") if isinstance(snapshot.get("aiAnalysis"), dict) else {}
        scope = snapshot.get("scope") if isinstance(snapshot.get("scope"), dict) else {}
        return {
            "recognizedAtUrl": app.get("url") or login.get("url"),
            "scopeMode": scope.get("mode") or ai_analysis.get("scopeMode") or "full",
            "componentHints": app.get("componentHints") or login.get("componentHints") or {},
            "aiAnalysis": ai_analysis,
            "relevantModules": ai_analysis.get("relevantModules") or [],
            "pageObjects": ai_analysis.get("pageObjects") or [],
            "navigationPlan": ai_analysis.get("navigationPlan") or [],
            "loginInputs": (login.get("inputs") or [])[:12],
            "menus": (app.get("menus") or [])[:80],
            "buttons": (app.get("buttons") or [])[:30],
            "tables": (app.get("tables") or [])[:20],
        }

    def _summary(self, snapshot: dict[str, Any], *, status: str, error: str) -> str:
        if status != "成功":
            return f"识别失败：{error[:200]}"
        app = snapshot.get("appPage") or {}
        login = snapshot.get("loginPage") or {}
        menus = app.get("menus") or []
        inputs = login.get("inputs") or []
        hints = app.get("componentHints") or login.get("componentHints") or {}
        ai_analysis = snapshot.get("aiAnalysis") if isinstance(snapshot.get("aiAnalysis"), dict) else {}
        page_objects = ai_analysis.get("pageObjects") or []
        ui = "Element UI" if hints.get("elementUI") else "Ant Design" if hints.get("antDesign") else "未知组件库"
        ai_text = f"；AI 页面对象 {len(page_objects)} 个" if page_objects else "；AI 页面对象待完善"
        return f"识别成功：{ui}；登录页输入框 {len(inputs)} 个；菜单 {len(menus)} 个{ai_text}；当前页面 {app.get('title') or login.get('title') or '-'}"

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
