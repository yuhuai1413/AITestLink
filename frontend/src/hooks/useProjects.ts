import { useState, useEffect, useCallback } from "react";
import { projectsApi } from "../api/project.api";
import type { Project, ProjectCreate, ProjectUpdate } from "../contracts/project";

export interface UseProjectsReturn {
  projects: Project[];
  loading: boolean;
  error: string | null;
  createProject: (data: ProjectCreate) => Promise<Project>;
  updateProject: (id: string, data: ProjectUpdate) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectsApi.list();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(async (data: ProjectCreate): Promise<Project> => {
    const newProject = await projectsApi.create(data);
    setProjects((prev) => [newProject, ...prev]);
    return newProject;
  }, []);

  const updateProject = useCallback(async (id: string, data: ProjectUpdate): Promise<Project> => {
    const updated = await projectsApi.update(id, data);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    refresh: fetchProjects,
  };
}
