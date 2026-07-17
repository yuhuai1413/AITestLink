import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useProjectData } from "./useProjectData";
import { DocGenerateTab } from "./detail/DocGenerateTab";
import { DocFusionTab } from "./detail/DocFusionTab";
import { DocManageTab } from "./detail/DocManageTab";
import { ExecuteScriptsTab } from "./detail/ExecuteScriptsTab";
import { FilesTab } from "./detail/FilesTab";
import { OverviewTab } from "./detail/OverviewTab";
import { RequirementsTab } from "./detail/RequirementsTab";
import { ScriptsTab } from "./detail/ScriptsTab";
import { SummaryTab } from "./detail/SummaryTab";
import { TestPointsTab } from "./detail/TestPointsTab";
import { TestCasesTab } from "./detail/TestCasesTab";
import { EnvironmentPage } from "../environment/EnvironmentPage";
import {
  getStoredProjectTab,
  isProjectDetailTabKey,
  persistProjectTab,
  projectDetailTabs as allTabs,
  type ProjectDetailTabKey as TabKey,
} from "./detail/projectDetail.config";

const tabComponents: Record<TabKey, FC<{ projectId: string }>> = {
  overview: OverviewTab,
  files: FilesTab,
  environment: EnvironmentPage,
  requirements: RequirementsTab,
  testPoints: TestPointsTab,
  testCases: TestCasesTab,
  scripts: ScriptsTab,
  executeScripts: ExecuteScriptsTab,
  docFusion: DocFusionTab,
  summary: SummaryTab,
  docGenerate: DocGenerateTab,
};



function TabLoadingSkeleton() {
  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="skeleton-line" style={{ width: '40%', height: 20, borderRadius: 4, background: 'var(--line)' }} />
      <div className="skeleton-line" style={{ width: '70%', height: 14, borderRadius: 4, background: 'var(--line)' }} />
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton-card" style={{ flex: 1, height: 80, borderRadius: 'var(--radius-l1)', background: 'var(--line)', opacity: 0.5 }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {[72, 88, 64, 94, 78].map((width, index) => (
          <div key={index} className="skeleton-line" style={{ width: `${width}%`, height: 14, borderRadius: 4, background: 'var(--line)', opacity: 0.4 }} />
        ))}
      </div>
    </div>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading } = useProjectData(id);
  const prevIdRef = useRef<string | null | undefined>(null);
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    return getStoredProjectTab(id) ?? "overview";
  });
  const tabContentRef = useRef<HTMLDivElement>(null);
  const handleTabChange = (tab: TabKey) => { setActiveTab(tab); persistProjectTab(id, tab); };

  // 仅在项目 ID 真正切换时重置到概览页，页面刷新时恢复已保存的 tab
  useEffect(() => {
    if (prevIdRef.current !== null && prevIdRef.current !== id) {
      const nextTab = getStoredProjectTab(id) ?? "overview";
      setActiveTab(nextTab);
      persistProjectTab(id, nextTab);
    }
    prevIdRef.current = id;
  }, [id]);

  // 监听通知点击的 CustomEvent，实时切换 tab 并持久化
  useEffect(() => {
    const handler = (e: Event) => {
      const { tab, projectId } = (e as CustomEvent).detail;
      if (projectId === id && isProjectDetailTabKey(tab)) {
        setActiveTab(tab);
        persistProjectTab(id, tab);
      }
    };
    window.addEventListener("aitestlink:navigate-tab", handler);
    return () => window.removeEventListener("aitestlink:navigate-tab", handler);
  }, [id]);

  // tab 切换时通知所有 useProjectData 实例刷新数据
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("aitestlink:data-refresh", { detail: { projectId: id } }));
  }, [activeTab, id]);

  useEffect(() => {
    tabContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  if (!project) {
    if (loading) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="detail-header">
            <button className="ghost-button" type="button" onClick={() => navigate("/projects")}><ArrowLeft size={13} /> 返回</button>
            <div className="skeleton-line" style={{ width: 200, height: 24, borderRadius: 4, background: 'var(--line)' }} />
          </div>
          <div className="tab-bar">
            {allTabs.map((tab) => <div key={tab.key} className="skeleton-line" style={{ width: 60, height: 16, borderRadius: 4, background: 'var(--line)', opacity: 0.4 }} />)}
          </div>
          <div className="tab-content"><TabLoadingSkeleton /></div>
        </div>
      );
    }
    return <div className="page-stack page-stack--spaced page-stack--fill"><div className="empty-state"><p>项目不存在或已删除。</p><button className="primary-button" type="button" onClick={() => navigate("/projects")}>返回项目列表</button></div></div>;
  }

  const ActiveComponent = tabComponents[activeTab];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="detail-header">
        <button className="ghost-button" type="button" onClick={() => navigate("/projects")}><ArrowLeft size={13} /> 返回</button>
        <h2 style={{ margin: 0 }}>{project.name}</h2>
      </div>
      <div className="tab-bar">
        {allTabs.map((tab) => <button key={tab.key} type="button" className={`tab-button ${activeTab === tab.key ? "tab-button--active" : ""}`} onClick={() => handleTabChange(tab.key)}>{tab.label}</button>)}
      </div>
      <div className="tab-content" ref={tabContentRef}>
        {allTabs.map((tab) => {
          const Comp = tabComponents[tab.key];
          if (!Comp) return null;
          return (
            <div key={tab.key} style={{ display: activeTab === tab.key ? "contents" : "none" }}>
              <Comp projectId={project.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
