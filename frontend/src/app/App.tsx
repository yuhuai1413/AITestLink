import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { GlobalAlert } from "../shared/components/GlobalAlert";
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
import { DocConfigPage } from "../features/doc-config/DocConfigPage";
import { LoginPage } from "../features/auth/LoginPage";
import { isLoggedIn } from "../features/auth/api/auth";
import { useAPISync } from "../api/useAPISync";
import { useStore } from "./store";
import { BASE_PATH } from "../shared/config/deploy";
import { initManager } from "../shared/hooks/aiTaskManager";
import { LAST_PATH_KEY } from "../shared/config/storage";


function pathnameToView(rawPathname: string): ViewKey {
  const pathname = BASE_PATH ? rawPathname.replace(BASE_PATH, "") || "/" : rawPathname;
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.match(/^\/test-center\/[a-f0-9-]+/)) return "testCenter";
  if (pathname.startsWith("/test-center")) return "testCenter";
  if (pathname.match(/^\/document-center\/[a-f0-9-]+/)) return "documentCenter";
  if (pathname.startsWith("/document-center")) return "documentCenter";
  if (pathname.startsWith("/doc-config")) return "docConfig";
  if (pathname.startsWith("/model-config")) return "modelConfig";
  if (pathname.startsWith("/user-management")) return "userManagement";
  return "dashboard";
}

function AppShellLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeView = pathnameToView(location.pathname);

  // 保存当前路径到 localStorage（去掉 BASE_PATH 前缀，存储相对路径）
  useEffect(() => {
    if (location.pathname !== "/login") {
      const relativePath = BASE_PATH ? location.pathname.replace(BASE_PATH, "") || "/" : location.pathname;
      localStorage.setItem(LAST_PATH_KEY, relativePath);
    }
  }, [location.pathname]);

  const handleChangeView = (view: ViewKey) => {
    const map: Record<ViewKey, string> = {
      dashboard: "/",
      projects: "/projects",
      testCenter: "/test-center",
      documentCenter: "/document-center",
      docConfig: "/doc-config",
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

// 恢复上次路径
function RestorePath() {
  const location = useLocation();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    const rp = BASE_PATH ? location.pathname.replace(BASE_PATH, "") || "/" : location.pathname;
    if (rp === "/") {
      let lastPath = localStorage.getItem(LAST_PATH_KEY);
      // 兼容旧数据：如果存储了含 BASE_PATH 前缀的路径，去掉前缀
      if (lastPath && BASE_PATH && lastPath.startsWith(BASE_PATH)) {
        lastPath = lastPath.replace(BASE_PATH, "") || "/";
      }
      if (lastPath && lastPath !== "/" && lastPath !== "/login") {
        window.location.replace(BASE_PATH + lastPath);
        return;
      }
    }
    setRedirected(true);
  }, []);

  if (!redirected) return null;
  return null;
}

export function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const { dispatch, state } = useStore();
  useAPISync(authed);

  // 初始化全局 AI 任务管理器
  useEffect(() => {
    initManager(dispatch, () => state.projects.map((p) => ({ id: p.id, name: p.name })));
  }, [dispatch, state.projects]);

  return (
    <>
    <GlobalAlert />
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
    <RestorePath />
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <LoginPage onLogin={() => setAuthed(true)} />} />
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
              <Route path="/doc-config" element={<DocConfigPage />} />
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
