import { useState } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { AppShell } from "../shared/components/AppShell";
import type { ViewKey } from "../shared/types/platform";
import { AutomationPage } from "../features/automation/AutomationPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { RequirementAnalysisPage } from "../features/requirements/RequirementAnalysisPage";
import { TestDesignPage } from "../features/test-design/TestDesignPage";
import { ModelConfigPage } from "../features/model-config/ModelConfigPage";
import { UserManagementPage } from "../features/user-management/UserManagementPage";
import { LoginPage } from "../features/auth/LoginPage";
import { isLoggedIn } from "../features/auth/api/auth";
import { useAPISync } from "../api/useAPISync";

function pathnameToView(pathname: string): ViewKey {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/requirements")) return "requirements";
  if (pathname.startsWith("/test-design")) return "testDesign";
  if (pathname.startsWith("/automation")) return "automation";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/model-config")) return "modelConfig";
  if (pathname.startsWith("/user-management")) return "userManagement";
  return "dashboard";
}

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
      modelConfig: "/model-config",
      userManagement: "/user-management",
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
  const [authed, setAuthed] = useState(isLoggedIn());
  useAPISync();

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={() => setAuthed(true)} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route
        path="/*"
        element={
          <AppShellLayout>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id/*" element={<ProjectDetailPage />} />
              <Route path="/requirements" element={<RequirementAnalysisPage />} />
              <Route path="/test-design" element={<TestDesignPage />} />
              <Route path="/automation" element={<AutomationPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/model-config" element={<ModelConfigPage />} />
              <Route path="/user-management" element={<UserManagementPage />} />
            </Routes>
          </AppShellLayout>
        }
      />
    </Routes>
  );
}
