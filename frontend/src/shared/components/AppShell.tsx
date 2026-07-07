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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { navigationItems } from "../data/platformData";
import { useStore } from "../../app/store";
import { PersonalSettingsModal } from "../../features/personal-settings/PersonalSettingsModal";
import { getMeWithAdmin } from "../../features/auth/api/auth";
import type { ViewKey } from "../types/platform";
import { useNavHighlight } from "../hooks/useNavHighlight";

interface UserInfo {
  nickname: string;
  phone: string;
  avatar: string;
  isAdmin: boolean;
}

function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
        stroke="white"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.1)"
      />
      <path
        d="M8.5 12.5l2.5 2.5 5-5.5"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.5" cy="5.5" r="1.5" fill="white" opacity="0.7" />
    </svg>
  );
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
  const { state } = useStore();
  const navigate = useNavigate();

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
        results.push({ type: "项目", label: p.name, sub: `${p.version} · ${p.status}`, icon: FolderOpen, onClick: () => navigate(`/projects/${p.id}`) });
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
            <LogoIcon />
          </div>
          <div className="brand-text">
            <strong>智测通</strong>
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
            <button className="icon-button" type="button" title="通知">
              <Bell size={18} />
            </button>
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
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    localStorage.removeItem("aitestlink-store");
                    setShowUserMenu(false);
                    window.location.href = "/login";
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
                <p>智测通是一款 AI 驱动的软件测试平台，支持从需求文档到测试用例的全链路自动化生成。</p>
              </div>
              <div className="help-section">
                <h3>核心功能</h3>
                <ul>
                  <li><strong>需求解析</strong> — 上传需求文档，AI 自动提取模块、测试点和业务规则</li>
                  <li><strong>测试设计</strong> — 基于需求生成测试点和测试用例</li>
                  <li><strong>用例管理</strong> — 在线编辑、评审和导出 Excel</li>
                  <li><strong>自动化中心</strong> — 脚本生成与执行分析（规划中）</li>
                </ul>
              </div>
              <div className="help-section">
                <h3>操作流程</h3>
                <ol>
                  <li>创建项目 → 上传需求资料</li>
                  <li>发起 AI 解析 → 确认识别结果</li>
                  <li>生成测试点 → 生成测试用例</li>
                  <li>人工评审 → 导出 Excel</li>
                </ol>
              </div>
              <div className="help-section">
                <h3>侧边栏操作</h3>
                <ul>
                  <li>点击左下角图标可收起/展开侧边栏</li>
                  <li>收起后只显示图标，点击图标仍可导航</li>
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
