import {
  Bell,
  ChevronRight,
  CircleHelp,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { navigationItems } from "../data/platformData";
import type { ViewKey } from "../types/platform";
import { useNavHighlight } from "../hooks/useNavHighlight";

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
  const activeItem = navigationItems.find((item) => item.key === activeView) ?? navigationItems[0];
  const activeIdx = navigationItems.findIndex((item) => item.key === activeView);

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // 选中层：始终跟踪 activeIdx，collapsed 变化时重算
  const { containerRef, register, style: activeStyle } = useNavHighlight(`nav-${activeIdx}`, [collapsed]);

  // 悬浮层：跟踪 hoveredIdx
  const { style: hoverStyle } = useNavHighlight(hoveredIdx !== null ? `nav-${hoveredIdx}` : null);

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
          {!collapsed && (
            <div>
              <strong>AITestLink</strong>
              <span>AI 测试平台</span>
            </div>
          )}
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

            {navigationItems.map((item, idx) => {
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
          <button className="icon-button" type="button" title="帮助">
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
            <label className="search-box">
              <Search size={17} />
              <input aria-label="搜索项目、用例或缺陷" placeholder="搜索项目、用例或缺陷" />
            </label>
            <button className="icon-button" type="button" title="通知">
              <Bell size={18} />
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
