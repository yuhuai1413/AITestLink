import {
  Bell,
  ChevronRight,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  FileText,
  ListChecks,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { navigationItems } from "../data/platformData";
import { useStore, useUnreadCount } from "../../app/store";
import { LOGIN_URL } from "../config/deploy";
import { PersonalSettingsModal } from "../../features/personal-settings/PersonalSettingsModal";
import { getMeWithAdmin } from "../../features/auth/api/auth";
import type { ViewKey } from "../types/platform";
import type { AppNotification } from "../types/platform";
import { useNavHighlight } from "../hooks/useNavHighlight";
import { notificationsApi } from "../../api/client";
import { LogoMark } from "../../features/auth/components/LogoMark";
import { TOKEN_KEY } from "../config/storage";
import { formatDateTime } from "../utils/dateTime";
import {
  getProjectTabFromTask,
  persistProjectTab,
} from "../../features/projects/detail/projectDetail.config";

interface UserInfo {
  nickname: string;
  phone: string;
  avatar: string;
  isAdmin: boolean;
}



interface AppShellProps {
  activeView: ViewKey;
  onChangeView: (view: ViewKey) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onChangeView, children }: AppShellProps) {
  const [userInfo, setUserInfo] = useState<UserInfo>({ nickname: "用户", phone: "", avatar: "", isAdmin: false });

  const visibleNavItems = useMemo(
    () => navigationItems.filter((item) => !item.hidden && (item.key !== "userManagement" || userInfo.isAdmin)),
    [userInfo.isAdmin]
  );

  const activeItem = visibleNavItems.find((item) => item.key === activeView) ?? visibleNavItems[0];
  const activeIdx = visibleNavItems.findIndex((item) => item.key === activeView);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const [helpPos, setHelpPos] = useState({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showPersonalSettings, setShowPersonalSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unreadCount = useUnreadCount();

  const handleNotificationClick = (notification: AppNotification) => {
    const tab = getProjectTabFromTask(notification.taskType);
    persistProjectTab(notification.projectId, tab);
    window.dispatchEvent(new CustomEvent("aitestlink:navigate-tab", { detail: { tab, projectId: notification.projectId } }));
    navigate(notification.targetPath || `/projects/${notification.projectId}`);
    dispatch({ type: "MARK_NOTIFICATION_READ", payload: notification.id });
    notificationsApi.markRead(notification.id).catch(() => {});
    setShowNotifications(false);
  };

  const fetchUser = useCallback(() => {
    getMeWithAdmin().then((res) => {
      if (res.ok && res.user) {
        const avatarUrl = res.user.avatar ? `${res.user.avatar}?t=${Date.now()}` : "";
        setUserInfo({
          nickname: res.user.nickname || "用户",
          phone: res.user.phone ? res.user.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "",
          avatar: avatarUrl,
          isAdmin: res.user.is_admin || false,
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  useEffect(() => {
    const handler = () => fetchUser();
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, [fetchUser]);

  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 路由切换时重新拉取用户信息，确保昵称/头像等始终最新
  useEffect(() => {
    fetchUser();
  }, [location.pathname, fetchUser]);

  // 选中层：始终跟踪 activeIdx，collapsed 变化时重算
  const { containerRef, register, style: activeStyle } = useNavHighlight(`nav-${activeIdx}`, [collapsed]);

  // 悬浮层：跟踪 hoveredIdx
  const { style: hoverStyle } = useNavHighlight(hoveredIdx !== null ? `nav-${hoveredIdx}` : null);

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: { type: string; label: string; sub: string; icon: typeof FileText; onClick: () => void }[] = [];

    state.projects.forEach((p) => {
      if (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) {
        results.push({ type: "项目", label: p.name, sub: p.testStatus, icon: FolderOpen, onClick: () => navigate(`/projects/${p.id}`) });
      }
    });
    state.requirements.forEach((r) => {
      if (r.module.toLowerCase().includes(q) || r.feature.toLowerCase().includes(q) || r.rule.toLowerCase().includes(q)) {
        results.push({ type: "需求", label: `${r.module} - ${r.feature}`, sub: r.rule.slice(0, 50), icon: FileText, onClick: () => navigate("/requirements") });
      }
    });
    state.testPoints.forEach((tp) => {
      if (tp.title.toLowerCase().includes(q) || tp.module.toLowerCase().includes(q)) {
        results.push({ type: "测试点", label: tp.title, sub: `${tp.module} · ${tp.priority}`, icon: ListChecks, onClick: () => navigate("/test-design") });
      }
    });
    state.testCases.forEach((tc) => {
      if (tc.title.toLowerCase().includes(q) || tc.caseCode.toLowerCase().includes(q)) {
        results.push({ type: "用例", label: tc.title, sub: `${tc.caseCode} · ${tc.priority}`, icon: ListChecks, onClick: () => navigate("/test-design") });
      }
    });

    return results.slice(0, 10);
  }, [searchQuery, state, navigate]);

  const userMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭用户菜单
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showUserMenu]);

  // 点击外部关闭通知面板
  useEffect(() => {
    if (!showNotifications) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications]);

  // 鼠标移动时跟随
  const handleNavMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const items = Array.from(container.querySelectorAll<HTMLButtonElement>(".nav-item"));
    const containerRect = container.getBoundingClientRect();
    const mouseY = e.clientY - containerRect.top;

    let closestIdx = 0;
    let closestDist = Infinity;
    items.forEach((item, i) => {
      const rect = item.getBoundingClientRect();
      const center = rect.top - containerRect.top + rect.height / 2;
      const dist = Math.abs(mouseY - center);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });

    setHoveredIdx(closestIdx);
  }, [containerRef]);

  // 离开时清除悬浮
  const handleNavMouseLeave = useCallback(() => {
    setHoveredIdx(null);
  }, []);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
        <div className="sidebar__brand">
          <div className="brand-mark">
            <LogoMark size={30} />
          </div>
          <div className="brand-text">
            <strong>AITestLink</strong>
            <span>AI 测试平台</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="主导航">
          <div
            ref={containerRef}
            className="nav-track"
            onMouseMove={handleNavMouseMove}
            onMouseLeave={handleNavMouseLeave}
          >
            {/* 选中高亮（深色，常驻） */}
            <div
              className="nav-highlight nav-highlight--active"
              style={{
                "--hl-top": `${activeStyle.top}px`,
                "--hl-height": `${activeStyle.height}px`,
                opacity: activeStyle.opacity,
              } as React.CSSProperties}
            />
            {/* 悬浮高亮（浅色，跟随鼠标） */}
            {hoveredIdx !== null && (
              <div
                className="nav-highlight nav-highlight--hover"
                style={{
                  "--hl-top": `${hoverStyle.top}px`,
                  "--hl-height": `${hoverStyle.height}px`,
                  opacity: hoveredIdx === activeIdx ? 0 : hoverStyle.opacity,
                } as React.CSSProperties}
              />
            )}

            {visibleNavItems.map((item, idx) => {
              const Icon = item.icon;
              const active = activeView === item.key;
              return (
                <button
                  type="button"
                  className={`nav-item ${active ? "nav-item--active" : ""}`}
                  key={item.key}
                  ref={register(`nav-${idx}`)}
                  onClick={() => onChangeView(item.key)}
                  title={collapsed ? item.label : item.description}
                >
                  <Icon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && active ? <ChevronRight size={16} className="nav-item__chevron" /> : null}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="sidebar__footer">
          <button className="icon-button" type="button" title={collapsed ? "展开侧边栏" : "收起侧边栏"} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button ref={helpBtnRef} className="icon-button" type="button" title="帮助" onClick={() => {
            const rect = helpBtnRef.current?.getBoundingClientRect();
            if (rect) setHelpPos({ top: window.innerHeight - rect.bottom, left: rect.right + 8 });
            setShowHelp(true);
          }}>
            <CircleHelp size={18} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="topbar__eyebrow">当前工作区</span>
            <h1>{activeItem.label}</h1>
          </div>
          <div className="topbar__tools">
            <div className="search-box-wrapper">
              <label className="search-box">
                <Search size={17} />
                <input
                  aria-label="搜索项目、用例或缺陷"
                  placeholder="搜索项目、用例或缺陷"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
                  onFocus={() => setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                />
              </label>
              {showSearchResults && searchQuery.trim() && (
                <div className="search-results">
                  {searchResults.length === 0 ? (
                    <div className="search-results__empty">未找到相关结果</div>
                  ) : (
                    searchResults.map((r, i) => {
                      const Icon = r.icon;
                      return (
                        <button
                          key={i}
                          type="button"
                          className="search-result-item"
                          onMouseDown={(e) => { e.preventDefault(); r.onClick(); setSearchQuery(""); setShowSearchResults(false); }}
                        >
                          <Icon size={16} />
                          <div>
                            <span className="search-result-item__type">{r.type}</span>
                            <strong>{r.label}</strong>
                            <span>{r.sub}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div className="notif-wrapper" ref={notifRef}>
              <button
                className="icon-button"
                type="button"
                title="通知"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  // 打开时标记全部已读
                  if (!showNotifications) {
                    state.notifications.forEach((n) => {
                      if (!n.read) dispatch({ type: "MARK_NOTIFICATION_READ", payload: n.id });
                    });
                    notificationsApi.markAllRead().catch(() => {});
                  }
                }}
              >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="notif-panel">
                  <div className="notif-panel__header">
                    <span>通知</span>
                    {state.notifications.length > 0 && (
                      <button className="text-button" type="button" onClick={() => { dispatch({ type: "CLEAR_NOTIFICATIONS" }); notificationsApi.clear().catch(() => {}); }}>
                        清空
                      </button>
                    )}
                  </div>
                  <div className="notif-panel__list">
                    {state.notifications.length === 0 ? (
                      <div className="notif-panel__empty">暂无通知</div>
                    ) : (
                      state.notifications.slice(0, 20).map((n: AppNotification) => (
                        <div key={n.id} className={`notif-item ${n.type === "任务失败" ? "notif-item--error" : "notif-item--success"}`} onClick={() => handleNotificationClick(n)}>
                          <div className="notif-item__icon">{n.type === "任务完成" ? "✓" : "✕"}</div>
                          <div className="notif-item__body">
                            <div className="notif-item__title">{n.taskType} · {n.projectName}</div>
                            <div className="notif-item__desc">{n.message}</div>
                            <div className="notif-item__time">{formatDateTime(n.createdAt)}</div>
                          </div>
                          <button
                            className="notif-item__clear"
                            type="button"
                            title="清除通知"
                            aria-label="清除通知"
                            onClick={(event) => {
                              event.stopPropagation();
                              dispatch({ type: "DELETE_NOTIFICATION", payload: n.id });
                              notificationsApi.delete(n.id).catch(() => {});
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="user-avatar-wrapper" ref={userMenuRef}>
              <button className="user-avatar" type="button" onClick={() => setShowUserMenu(!showUserMenu)} style={userInfo.avatar ? { backgroundImage: `url(${userInfo.avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                {!userInfo.avatar && <span>{userInfo.nickname.charAt(0)}</span>}
              </button>
              {showUserMenu && (
                <div className="user-menu">
                  <div className="user-menu__header">
                    <div className="user-avatar user-avatar--sm" style={userInfo.avatar ? { backgroundImage: `url(${userInfo.avatar})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                      {!userInfo.avatar && <span>{userInfo.nickname.charAt(0)}</span>}
                    </div>
                    <div>
                      <strong>{userInfo.nickname}</strong>
                      <span>{userInfo.phone}</span>
                    </div>
                  </div>
                  <div className="user-menu__divider" />
                  <button className="user-menu__item" type="button" onClick={() => { setShowUserMenu(false); setShowPersonalSettings(true); }} style={{ paddingLeft: 16, gap: 10 }}>
                    <span style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings size={16} /></span> 个人设置
                  </button>
                  <button className="user-menu__item user-menu__item--danger" type="button" onClick={() => {
localStorage.removeItem(TOKEN_KEY);
                    setShowUserMenu(false);
                    window.location.href = LOGIN_URL;
                  }} style={{ paddingLeft: 16, gap: 10 }}>
                    <span style={{ width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><LogOut size={16} /></span> 退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>

      {/* 帮助弹窗 */}
      {showHelp && (
        <div className="help-popover" onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
          <div className="help-popover__content" style={{ bottom: `${helpPos.top}px`, left: `${helpPos.left}px` }}>
            <div className="help-popover__header">
              <h2>使用帮助</h2>
              <button className="icon-button" type="button" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div className="help-popover__body">
              <div className="help-section">
                <h3>平台简介</h3>
                <p>AITestLink 是一套面向软件测试全流程的 AI 协作平台，覆盖资料上传、需求解析、测试设计、自动化脚本、执行汇总和测试文档生成。</p>
              </div>
              <div className="help-section">
                <h3>项目主流程</h3>
                <ol>
                  <li>在项目空间创建项目，进入项目详情后上传需求、原型、接口文档等输入资料</li>
                  <li>配置测试环境和测试账号，再发起 AI 需求解析或 AI 反推需求</li>
                  <li>评审通过需求后生成测试点，评审通过测试点后生成测试用例</li>
                  <li>评审通过适合自动化的用例后生成脚本，再进入执行脚本完成运行</li>
                  <li>汇总手工和自动化结果，按模板生成测试总结和交付文档</li>
                </ol>
              </div>
              <div className="help-section">
                <h3>常用入口</h3>
                <ul>
                  <li><strong>首页驾驶舱</strong> — 查看质量状态、项目风险、待办和关键指标</li>
                  <li><strong>项目空间</strong> — 管理项目、输入资料、AI 生成结果、评审和导出</li>
                  <li><strong>文档配置</strong> — 上传 Word 模板，维护文档分类、模板说明和解析结果</li>
                  <li><strong>模型配置</strong> — 配置各 AI 节点的供应商、模型、Base URL、API Key 和提示词</li>
                  <li><strong>用户管理</strong> — 管理系统用户，仅管理员账号可见</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>评审与数据规则</h3>
                <ul>
                  <li>需求、测试点、测试用例和脚本都需要人工评审后，才能进入下游生成或执行</li>
                  <li>删除输入资料或重新生成上游数据时，下游关联数据可能被清理或标记为已失效</li>
                  <li>导出 Excel、生成脚本和文档生成会优先使用有效且已评审通过的数据</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>操作提示</h3>
                <ul>
                  <li>顶部搜索可快速定位项目、需求、测试点和测试用例</li>
                  <li>通知面板会展示 AI 任务完成或失败消息，点击通知可跳转到对应项目页签</li>
                  <li>左下角按钮可收起或展开侧边栏，收起后仍可通过图标导航</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <PersonalSettingsModal
        open={showPersonalSettings}
        onClose={() => setShowPersonalSettings(false)}
        userInfo={userInfo}
        onSaved={fetchUser}
      />
    </div>
  );
}
