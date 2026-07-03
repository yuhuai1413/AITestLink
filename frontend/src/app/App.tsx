import { useState, useEffect } from "react";
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
import { LoginPage } from "../features/auth/LoginPage";
import { useAPISync } from "../api/useAPISync";

/** 检查用户是否已登录 */
function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
    setLoading(false);
  }, []);

  return { isLoggedIn, loading };
}

/** 路由守卫：未登录时跳转到登录页 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-stack" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <p>加载中...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/** 把 URL pathname 映射到 ViewKey */
function pathnameToView(pathname: string): ViewKey {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/requirements")) return "requirements";
  if (pathname.startsWith("/test-design")) return "testDesign";
  if (pathname.startsWith("/automation")) return "automation";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/model-config")) return "modelConfig";
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
      modelConfig: "/model-config",
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
  useAPISync();

  return (
    <Routes>
      {/* 登录页面 - 不需要认证 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 需要认证的页面 */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
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
              </Routes>
            </AppShellLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
