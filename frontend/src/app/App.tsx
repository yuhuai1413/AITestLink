import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { GlobalAlert } from "../shared/components/GlobalAlert";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { AppShell } from "../shared/components/AppShell";
import type { ViewKey } from "../shared/types/platform";
import { LoginPage } from "../features/auth/LoginPage";
import { isLoggedIn } from "../features/auth/api/auth";
import { useAPISync } from "../api/useAPISync";
import { useStore } from "./store";
import { BASE_PATH } from "../shared/config/deploy";
import { initManager } from "../shared/hooks/aiTaskManager";
import { LAST_PATH_KEY } from "../shared/config/storage";
import { notificationsApi } from "../api/client";

const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ProjectsPage = lazy(() => import("../features/projects/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const ProjectDetailPage = lazy(() => import("../features/projects/ProjectDetailPage").then((module) => ({ default: module.ProjectDetailPage })));
const TestCenterListPage = lazy(() => import("../features/test-center/TestCenterListPage").then((module) => ({ default: module.TestCenterListPage })));
const TestCenterProjectPage = lazy(() => import("../features/test-center/TestCenterProjectPage").then((module) => ({ default: module.TestCenterProjectPage })));
const DocumentCenterListPage = lazy(() => import("../features/document-center/DocumentCenterListPage").then((module) => ({ default: module.DocumentCenterListPage })));
const DocumentCenterProjectPage = lazy(() => import("../features/document-center/DocumentCenterProjectPage").then((module) => ({ default: module.DocumentCenterProjectPage })));
const ModelConfigPage = lazy(() => import("../features/model-config/ModelConfigPage").then((module) => ({ default: module.ModelConfigPage })));
const UserManagementPage = lazy(() => import("../features/user-management/UserManagementPage").then((module) => ({ default: module.UserManagementPage })));
const DocConfigPage = lazy(() => import("../features/doc-config/DocConfigPage").then((module) => ({ default: module.DocConfigPage })));

function RouteFallback() {
  return <div className="empty-state"><p>页面加载中...</p></div>;
}


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

  // 从后端加载通知列表
  useEffect(() => {
    if (!authed) return;
    notificationsApi.list().then((list) => {
      if (list.length > 0) {
        dispatch({ type: "SET_NOTIFICATIONS", payload: list });
      }
    }).catch(() => {});
  }, [authed, dispatch]);

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
            <Suspense fallback={<RouteFallback />}>
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
            </Suspense>
          </AppShellLayout>
        }
      />
    </Routes>
    </>
  );
}
