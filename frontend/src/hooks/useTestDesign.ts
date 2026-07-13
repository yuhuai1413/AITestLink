import { useState, useEffect, useCallback } from "react";
import { testPointsApi, testCasesApi } from "../api/test-design.api";
import type {
  TestPoint,
  TestPointCreate,
  TestPointUpdate,
  TestCase,
  TestCaseCreate,
  TestCaseUpdate,
  TestCoverage,
} from "../contracts/test-design";

export interface UseTestDesignReturn {
  testPoints: TestPoint[];
  testCases: TestCase[];
  coverage: TestCoverage | null;
  loading: boolean;
  error: string | null;
  // Test Points
  createTestPoint: (data: TestPointCreate) => Promise<TestPoint>;
  updateTestPoint: (id: string, data: TestPointUpdate) => Promise<TestPoint>;
  deleteTestPoint: (id: string) => Promise<void>;
  generateTestPoints: (requirementIds: string[]) => Promise<TestPoint[]>;
  batchReviewTestPoints: (ids: string[], status: string) => Promise<number>;
  // Test Cases
  createTestCase: (data: TestCaseCreate) => Promise<TestCase>;
  updateTestCase: (id: string, data: TestCaseUpdate) => Promise<TestCase>;
  deleteTestCase: (id: string) => Promise<void>;
  generateTestCases: (testPointIds: string[]) => Promise<TestCase[]>;
  batchUpdateCaseStatus: (ids: string[], status: string) => Promise<number>;
  batchReviewTestCases: (ids: string[], status: string) => Promise<number>;
  // Coverage
  refreshCoverage: () => Promise<void>;
  // General
  refresh: () => Promise<void>;
  refreshTestPoints: () => Promise<void>;
  refreshTestCases: () => Promise<void>;
}

export function useTestDesign(projectId: string | undefined): UseTestDesignReturn {
  const [testPoints, setTestPoints] = useState<TestPoint[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [coverage, setCoverage] = useState<TestCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTestPoints = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await testPointsApi.list(projectId);
      setTestPoints(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch test points");
      setTestPoints([]);
    }
  }, [projectId]);

  const fetchTestCases = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await testCasesApi.list(projectId);
      setTestCases(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch test cases");
      setTestCases([]);
    }
  }, [projectId]);

  const fetchCoverage = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await testCasesApi.getCoverage(projectId);
      setCoverage(data);
    } catch (err) {
      // Coverage is optional, don't set error
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    await Promise.all([fetchTestPoints(), fetchTestCases(), fetchCoverage()]);
    setLoading(false);
  }, [projectId, fetchTestPoints, fetchTestCases, fetchCoverage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Test Point operations
  const createTestPoint = useCallback(async (data: TestPointCreate): Promise<TestPoint> => {
    if (!projectId) throw new Error("No project ID");
    const result = await testPointsApi.create(projectId, data);
    setTestPoints((prev) => [...prev, result]);
    return result;
  }, [projectId]);

  const updateTestPoint = useCallback(async (id: string, data: TestPointUpdate): Promise<TestPoint> => {
    const result = await testPointsApi.update(id, data);
    setTestPoints((prev) => prev.map((tp) => (tp.id === id ? result : tp)));
    return result;
  }, []);

  const deleteTestPoint = useCallback(async (id: string): Promise<void> => {
    await testPointsApi.delete(id);
    setTestPoints((prev) => prev.filter((tp) => tp.id !== id));
  }, []);

  const generateTestPoints = useCallback(async (requirementIds: string[]): Promise<TestPoint[]> => {
    if (!projectId) throw new Error("No project ID");
    const result = await testPointsApi.generate(projectId, requirementIds);
    setTestPoints((prev) => [...prev, ...result]);
    return result;
  }, [projectId]);

  const batchReviewTestPoints = useCallback(async (ids: string[], status: string): Promise<number> => {
    const result = await testPointsApi.batchReview(ids, status);
    await fetchTestPoints();
    return result.updated;
  }, [fetchTestPoints]);

  // Test Case operations
  const createTestCase = useCallback(async (data: TestCaseCreate): Promise<TestCase> => {
    if (!projectId) throw new Error("No project ID");
    const result = await testCasesApi.create(projectId, data);
    setTestCases((prev) => [...prev, result]);
    return result;
  }, [projectId]);

  const updateTestCase = useCallback(async (id: string, data: TestCaseUpdate): Promise<TestCase> => {
    const result = await testCasesApi.update(id, data);
    setTestCases((prev) => prev.map((tc) => (tc.id === id ? result : tc)));
    return result;
  }, []);

  const deleteTestCase = useCallback(async (id: string): Promise<void> => {
    await testCasesApi.delete(id);
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  }, []);

  const generateTestCases = useCallback(async (testPointIds: string[]): Promise<TestCase[]> => {
    if (!projectId) throw new Error("No project ID");
    const result = await testCasesApi.generate(projectId, testPointIds);
    setTestCases((prev) => [...prev, ...result]);
    return result;
  }, [projectId]);

  const batchUpdateCaseStatus = useCallback(async (ids: string[], status: string): Promise<number> => {
    const result = await testCasesApi.batchStatus(ids, status);
    await fetchTestCases();
    return result.updated;
  }, [fetchTestCases]);

  const batchReviewTestCases = useCallback(async (ids: string[], status: string): Promise<number> => {
    const result = await testCasesApi.batchReview(ids, status);
    await fetchTestCases();
    return result.updated;
  }, [fetchTestCases]);

  return {
    testPoints,
    testCases,
    coverage,
    loading,
    error,
    createTestPoint,
    updateTestPoint,
    deleteTestPoint,
    generateTestPoints,
    batchReviewTestPoints,
    createTestCase,
    updateTestCase,
    deleteTestCase,
    generateTestCases,
    batchUpdateCaseStatus,
    batchReviewTestCases,
    refreshCoverage: fetchCoverage,
    refresh,
    refreshTestPoints: fetchTestPoints,
    refreshTestCases: fetchTestCases,
  };
}
