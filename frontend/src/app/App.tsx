import { useState } from "react";
import { Toaster } from "sonner";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { AppShell } from "../shared/components/AppShell";
import type { ViewKey } from "../shared/types/platform";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { TestCenterListPage } from "../features/test-center/TestCenterListPage";
import { TestCenterProjectPage } from "../features/test-center/TestCenterProjectPage";
import { DocumentCenterListPage } from "../features/document-center/DocumentCenterListPage";
import { DocumentCenterProjectPage } from "../features/document-center/DocumentCenterProjectPage";
import { ModelConfigPage } from "../features/model-config/ModelConfigPage";
import { UserManagementPage } from "../features/user-management/UserManagementPage";
import { LoginPage } from "../features/auth/LoginPage";
import { isLoggedIn } from "../features/auth/api/auth";
import { useAPISync } from "../api/useAPISync";

function pathnameToView(pathname: string): ViewKey {
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.match(/^\/test-center\/[a-f0-9-]+/)) return "testCenter";
  if (pathname.startsWith("/test-center")) return "testCenter";
  if (pathname.match(/^\/document-center\/[a-f0-9-]+/)) return "documentCenter";
  if (pathname.startsWith("/document-center")) return "documentCenter";
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
      testCenter: "/test-center",
      documentCenter: "/document-center",
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
    <>
    <Toaster
      position="top-center"
      richColors
      toastOptions={{
        style: {
          borderRadius: "16px",
          fontSize: "14px",
          fontWeight: 500,
        },
      }}
    />
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
              <Route path="/test-center" element={<TestCenterListPage />} />
              <Route path="/test-center/:id" element={<TestCenterProjectPage />} />
              <Route path="/document-center" element={<DocumentCenterListPage />} />
              <Route path="/document-center/:id" element={<DocumentCenterProjectPage />} />
              <Route path="/model-config" element={<ModelConfigPage />} />
              <Route path="/user-management" element={<UserManagementPage />} />
            </Routes>
          </AppShellLayout>
        }
      />
    </Routes>
    </>
  );
}
