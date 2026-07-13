import { useState, useEffect, useCallback } from "react";
import { scriptsApi } from "../api/automation.api";
import type { Script, ExecutionResult } from "../contracts/automation";

export interface UseAutomationReturn {
  scripts: Script[];
  loading: boolean;
  error: string | null;
  generateScripts: () => Promise<{ ok: boolean; count: number; scripts: Script[] }>;
  updateScript: (id: string, data: Partial<Script>) => Promise<Script>;
  deleteScript: (id: string) => Promise<void>;
  executeScript: (id: string) => Promise<ExecutionResult>;
  refresh: () => Promise<void>;
}

export function useAutomation(projectId: string | undefined): UseAutomationReturn {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScripts = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await scriptsApi.list(projectId);
      setScripts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch scripts");
      setScripts([]);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    await fetchScripts();
    setLoading(false);
  }, [projectId, fetchScripts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const generateScripts = useCallback(async () => {
    if (!projectId) throw new Error("No project ID");
    const result = await scriptsApi.generate(projectId);
    if (result.ok && result.scripts) {
      setScripts(result.scripts);
    }
    return result;
  }, [projectId]);

  const updateScript = useCallback(async (id: string, data: Partial<Script>): Promise<Script> => {
    const result = await scriptsApi.update(id, data);
    setScripts((prev) => prev.map((s) => (s.id === id ? result : s)));
    return result;
  }, []);

  const deleteScript = useCallback(async (id: string): Promise<void> => {
    await scriptsApi.delete(id);
    setScripts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const executeScript = useCallback(async (id: string): Promise<ExecutionResult> => {
    const result = await scriptsApi.execute(id);
    await fetchScripts(); // Refresh to get updated status
    return result;
  }, [fetchScripts]);

  return {
    scripts,
    loading,
    error,
    generateScripts,
    updateScript,
    deleteScript,
    executeScript,
    refresh,
  };
}
