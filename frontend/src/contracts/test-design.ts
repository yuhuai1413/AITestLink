// Test Design Types

export interface TestPoint {
  id: string;
  projectId: string;
  requirementId: string | null;
  module: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  automatable: boolean;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestPointCreate {
  module: string;
  type: string;
  title: string;
  description?: string;
  priority?: string;
  automatable?: boolean;
}

export type TestPointUpdate = Partial<TestPointCreate> & {
  reviewStatus?: string;
};

export interface TestCase {
  id: string;
  projectId: string;
  testPointId: string | null;
  requirementId: string | null;
  caseCode: string;
  module: string;
  feature: string;
  title: string;
  priority: string;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  testType: string;
  actualResult: string;
  passed: string;
  automation: string;
  reviewStatus: string;
  remark: string;
  tester: string;
  testDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseCreate {
  caseCode: string;
  module: string;
  feature?: string;
  title: string;
  priority?: string;
  precondition?: string;
  steps?: string;
  testData?: string;
  expectedResult?: string;
  testType?: string;
  automation?: string;
  reviewStatus?: string;
  remark?: string;
  testPointId?: string;
  requirementId?: string;
}

export type TestCaseUpdate = Partial<Omit<TestCaseCreate, "caseCode">>;

export interface TestCoverage {
  totalRequirements: number;
  coveredRequirements: number;
  totalTestPoints: number;
  totalTestCases: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  automationRate: number;
}

export type ScenarioType = "正常流程" | "异常流程" | "边界值" | "权限控制" | "数据一致性" | "状态流转";
export type TestPriority = "P0" | "P1" | "P2" | "P3";
export type ReviewStatus = "待评审" | "评审中" | "已通过" | "已驳回";
export type TestStatus = "未执行" | "通过" | "失败" | "阻塞" | "跳过";
