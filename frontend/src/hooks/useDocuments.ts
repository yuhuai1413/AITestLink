import { useState, useEffect, useCallback } from "react";
import { filesApi, requirementsApi } from "../api/document.api";
import type { FileAsset, Requirement, RequirementUpdate } from "../contracts/document";

export interface UseDocumentsReturn {
  files: FileAsset[];
  requirements: Requirement[];
  loading: boolean;
  error: string | null;
  uploadFile: (file: File) => Promise<FileAsset>;
  deleteFile: (id: string) => Promise<void>;
  updateRequirement: (id: string, data: RequirementUpdate) => Promise<Requirement>;
  refresh: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  refreshRequirements: () => Promise<void>;
}

export function useDocuments(projectId: string | undefined): UseDocumentsReturn {
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await filesApi.list(projectId);
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch files");
      setFiles([]);
    }
  }, [projectId]);

  const fetchRequirements = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await requirementsApi.list(projectId);
      setRequirements(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requirements");
      setRequirements([]);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    await Promise.all([fetchFiles(), fetchRequirements()]);
    setLoading(false);
  }, [projectId, fetchFiles, fetchRequirements]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = useCallback(async (file: File): Promise<FileAsset> => {
    if (!projectId) throw new Error("No project ID");
    const result = await filesApi.upload(projectId, file);
    setFiles((prev) => [result, ...prev]);
    return result;
  }, [projectId]);

  const deleteFile = useCallback(async (id: string): Promise<void> => {
    await filesApi.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateRequirement = useCallback(async (id: string, data: RequirementUpdate): Promise<Requirement> => {
    const updated = await requirementsApi.update(id, data);
    setRequirements((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  return {
    files,
    requirements,
    loading,
    error,
    uploadFile,
    deleteFile,
    updateRequirement,
    refresh,
    refreshFiles: fetchFiles,
    refreshRequirements: fetchRequirements,
  };
}
