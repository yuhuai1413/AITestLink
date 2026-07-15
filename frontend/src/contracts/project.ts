// Project Types

export type TestType = "首轮全量测试" | "回归测试" | "增量测试" | "专项测试";
export type ProjectPriority = "高" | "中" | "低";

export interface Project {
  id: string;
  name: string;
  testType: TestType;
  testStatus: string;
  docStatus: string;
  description: string;
  caseCount: number;
  passRate: number;
  priority: ProjectPriority;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreate {
  name: string;
  testType: TestType;
  testStatus?: string;
  docStatus?: string;
  priority?: ProjectPriority;
  description?: string;
}

export type ProjectUpdate = Partial<ProjectCreate>;
