import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AppShell } from "../shared/components/AppShell";
import type { ViewKey } from "../shared/types/platform";
import { AutomationPage } from "../features/automation/AutomationPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { RequirementAnalysisPage } from "../features/requirements/RequirementAnalysisPage";
import { TestDesignPage } from "../features/test-design/TestDesignPage";

/** 把 URL pathname 映射到 ViewKey */
function pathnameToView(pathname: string): ViewKey {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/requirements")) return "requirements";
  if (pathname.startsWith("/test-design")) return "testDesign";
  if (pathname.startsWith("/automation")) return "automation";
  if (pathname.startsWith("/reports")) return "reports";
  return "dashboard";
}

/** 包装器：让 AppShell 的导航与路由联动 */
function AppShellLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeView = pathnameToView(location.pathname);

  const handleChangeView = (view: ViewKey) => {
    const map: Record<ViewKey, string> = {
      dashboard: "/",
      projects: "/projects",
      requirements: "/requirements",
      testDesign: "/test-design",
      automation: "/automation",
      reports: "/reports",
    };
    navigate(map[view]);
  };

  return (
    <AppShell activeView={activeView} onChangeView={handleChangeView}>
      {children}
    </AppShell>
  );
}

export function App() {
  return (
    <AppShellLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id/*" element={<ProjectDetailPage />} />
        <Route path="/requirements" element={<RequirementAnalysisPage />} />
        <Route path="/test-design" element={<TestDesignPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </AppShellLayout>
  );
}
