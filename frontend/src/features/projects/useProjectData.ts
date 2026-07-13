import { useCallback, useEffect, useState } from "react";
import { projectsApi } from "../../api/project.api";
import { filesApi } from "../../api/document.api";
import { requirementsApi } from "../../api/document.api";
import { testPointsApi, testCasesApi } from "../../api/test-design.api";
import { scriptsApi } from "../../api/automation.api";
import type { Project } from "../../contracts/project";
import type { FileAsset } from "../../contracts/document";
import type { Requirement } from "../../contracts/document";
import type { TestPoint, TestCase } from "../../contracts/test-design";
import type { Script } from "../../contracts/automation";

export interface ProjectData {
  project: Project | null;
  files: FileAsset[];
  requirements: Requirement[];
  testPoints: TestPoint[];
  testCases: TestCase[];
  scripts: Script[];
  loading: boolean;
  initialLoading: boolean;
  refresh: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  refreshRequirements: () => Promise<void>;
  refreshTestPoints: () => Promise<void>;
  refreshTestCases: () => Promise<void>;
  refreshScripts: () => Promise<void>;
}

export function useProjectData(projectId: string | undefined): ProjectData {
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testPoints, setTestPoints] = useState<TestPoint[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);

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
    setInitialLoading(false);
  }, [projectId, refreshProject, refreshFiles, refreshRequirements, refreshTestPoints, refreshTestCases, refreshScripts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 监听全局数据刷新事件
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
    initialLoading,
    refresh,
    refreshFiles,
    refreshRequirements,
    refreshTestPoints,
    refreshTestCases,
    refreshScripts,
  };
}
