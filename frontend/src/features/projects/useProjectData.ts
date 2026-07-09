import { useCallback, useEffect, useState } from "react";
import {
  projectsApi,
  filesApi,
  requirementsApi,
  testPointsApi,
  testCasesApi,
  scriptsApi,
  type ApiProject,
  type ApiFile,
  type ApiRequirement,
  type ApiTestPoint,
  type ApiTestCase,
  type ApiScript,
} from "../../api/client";

export interface ProjectData {
  project: ApiProject | null;
  files: ApiFile[];
  requirements: ApiRequirement[];
  testPoints: ApiTestPoint[];
  testCases: ApiTestCase[];
  scripts: ApiScript[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  refreshRequirements: () => Promise<void>;
  refreshTestPoints: () => Promise<void>;
  refreshTestCases: () => Promise<void>;
  refreshScripts: () => Promise<void>;
}

export function useProjectData(projectId: string | undefined): ProjectData {
  const [project, setProject] = useState<ApiProject | null>(null);
  const [files, setFiles] = useState<ApiFile[]>([]);
  const [requirements, setRequirements] = useState<ApiRequirement[]>([]);
  const [testPoints, setTestPoints] = useState<ApiTestPoint[]>([]);
  const [testCases, setTestCases] = useState<ApiTestCase[]>([]);
  const [scripts, setScripts] = useState<ApiScript[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await projectsApi.get(projectId);
      setProject(data);
    } catch {
      setProject(null);
    }
  }, [projectId]);

  const refreshFiles = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await filesApi.list(projectId);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
  }, [projectId]);

  const refreshRequirements = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await requirementsApi.list(projectId);
      setRequirements(Array.isArray(data) ? data : []);
    } catch {
      setRequirements([]);
    }
  }, [projectId]);

  const refreshTestPoints = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await testPointsApi.list(projectId);
      setTestPoints(Array.isArray(data) ? data : []);
    } catch {
      setTestPoints([]);
    }
  }, [projectId]);

  const refreshTestCases = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await testCasesApi.list(projectId);
      setTestCases(Array.isArray(data) ? data : []);
    } catch {
      setTestCases([]);
    }
  }, [projectId]);

  const refreshScripts = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await scriptsApi.list(projectId);
      setScripts(Array.isArray(data) ? data : []);
    } catch {
      setScripts([]);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    await Promise.all([
      refreshProject(),
      refreshFiles(),
      refreshRequirements(),
      refreshTestPoints(),
      refreshTestCases(),
      refreshScripts(),
    ]);
    setLoading(false);
  }, [projectId, refreshProject, refreshFiles, refreshRequirements, refreshTestPoints, refreshTestCases, refreshScripts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 监听全局数据刷新事件（删除文件等操作后触发）
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId: pid } = (e as CustomEvent).detail || {};
      if (pid === projectId) refresh();
    };
    window.addEventListener("aitestlink:data-refresh", handler);
    return () => window.removeEventListener("aitestlink:data-refresh", handler);
  }, [projectId, refresh]);

  return {
    project,
    files,
    requirements,
    testPoints,
    testCases,
    scripts,
    loading,
    refresh,
    refreshFiles,
    refreshRequirements,
    refreshTestPoints,
    refreshTestCases,
    refreshScripts,
  };
}
