// Project Types

export interface Project {
  id: string;
  name: string;
  testType: string;
  testStatus: string;
  docStatus: string;
  description: string;
  caseCount: number;
  passRate: number;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreate {
  name: string;
  testType: string;
  testStatus?: string;
  docStatus?: string;
  priority?: string;
  description?: string;
}

export type ProjectUpdate = Partial<ProjectCreate>;
