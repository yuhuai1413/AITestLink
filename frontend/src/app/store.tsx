import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  AITask,
  FileAsset,
  Project,
  Requirement,
  TestCase,
  TestPoint,
} from "../shared/types/platform";
import {
  initialFiles,
  initialProjects,
  initialRequirements,
  initialTestCases,
  initialTestPoints,
} from "../shared/data/initialData";

// ─── State ───

export interface AppState {
  projects: Project[];
  files: FileAsset[];
  requirements: Requirement[];
  testPoints: TestPoint[];
  testCases: TestCase[];
  aiTasks: AITask[];
}

const STORAGE_KEY = "aitestlink-store";

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.projects && Array.isArray(parsed.projects)) {
        return parsed;
      }
    }
  } catch {}
  return initialState;
}

function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const initialState: AppState = {
  projects: initialProjects,
  files: initialFiles,
  requirements: initialRequirements,
  testPoints: initialTestPoints,
  testCases: initialTestCases,
  aiTasks: [],
};

// ─── Actions ───

type Action =
  | { type: "ADD_PROJECT"; payload: Project }
  | { type: "UPDATE_PROJECT"; payload: Project }
  | { type: "DELETE_PROJECT"; payload: string }
  | { type: "ADD_FILE"; payload: FileAsset }
  | { type: "UPDATE_FILE"; payload: FileAsset }
  | { type: "DELETE_FILE"; payload: string }
  | { type: "ADD_REQUIREMENT"; payload: Requirement }
  | { type: "ADD_REQUIREMENTS"; payload: Requirement[] }
  | { type: "UPDATE_REQUIREMENT"; payload: Requirement }
  | { type: "CONFIRM_REQUIREMENT"; payload: string }
  | { type: "ADD_TEST_POINT"; payload: TestPoint }
  | { type: "ADD_TEST_POINTS"; payload: TestPoint[] }
  | { type: "UPDATE_TEST_POINT"; payload: TestPoint }
  | { type: "DELETE_TEST_POINT"; payload: string }
  | { type: "ADD_TEST_CASE"; payload: TestCase }
  | { type: "ADD_TEST_CASES"; payload: TestCase[] }
  | { type: "UPDATE_TEST_CASE"; payload: TestCase }
  | { type: "DELETE_TEST_CASE"; payload: string }
  | { type: "ADD_AI_TASK"; payload: AITask }
  | { type: "UPDATE_AI_TASK"; payload: AITask };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_PROJECT":
      if (state.projects.some((p) => p.id === action.payload.id)) return state;
      return { ...state, projects: [...state.projects, action.payload] };

    case "UPDATE_PROJECT":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? action.payload : p,
        ),
      };

    case "DELETE_PROJECT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        files: state.files.filter((f) => f.projectId !== action.payload),
        requirements: state.requirements.filter((r) => r.projectId !== action.payload),
        testPoints: state.testPoints.filter((tp) => tp.projectId !== action.payload),
        testCases: state.testCases.filter((tc) => tc.projectId !== action.payload),
        aiTasks: state.aiTasks.filter((t) => t.projectId !== action.payload),
      };

    case "ADD_FILE":
      if (state.files.some((f) => f.id === action.payload.id)) return state;
      return { ...state, files: [...state.files, action.payload] };

    case "UPDATE_FILE":
      return {
        ...state,
        files: state.files.map((f) =>
          f.id === action.payload.id ? action.payload : f,
        ),
      };

    case "DELETE_FILE":
      return {
        ...state,
        files: state.files.filter((f) => f.id !== action.payload),
      };

    case "ADD_REQUIREMENT":
      if (state.requirements.some((r) => r.id === action.payload.id)) return state;
      return {
        ...state,
        requirements: [...state.requirements, action.payload],
      };

    case "ADD_REQUIREMENTS":
      const existingReqIds = new Set(state.requirements.map((r) => r.id));
      const newReq = action.payload.filter((r) => !existingReqIds.has(r.id));
      return {
        ...state,
        requirements: [...state.requirements, ...newReq],
      };

    case "UPDATE_REQUIREMENT":
      return {
        ...state,
        requirements: state.requirements.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      };

    case "CONFIRM_REQUIREMENT":
      return {
        ...state,
        requirements: state.requirements.map((r) =>
          r.id === action.payload ? { ...r, confirmed: true } : r,
        ),
      };

    case "ADD_TEST_POINT":
      if (state.testPoints.some((tp) => tp.id === action.payload.id)) return state;
      return {
        ...state,
        testPoints: [...state.testPoints, action.payload],
      };

    case "ADD_TEST_POINTS":
      const existingTpIds = new Set(state.testPoints.map((tp) => tp.id));
      const newTp = action.payload.filter((tp) => !existingTpIds.has(tp.id));
      return {
        ...state,
        testPoints: [...state.testPoints, ...newTp],
      };

    case "UPDATE_TEST_POINT":
      return {
        ...state,
        testPoints: state.testPoints.map((tp) =>
          tp.id === action.payload.id ? action.payload : tp,
        ),
      };

    case "DELETE_TEST_POINT":
      return {
        ...state,
        testPoints: state.testPoints.filter(
          (tp) => tp.id !== action.payload,
        ),
      };

    case "ADD_TEST_CASE":
      if (state.testCases.some((tc) => tc.id === action.payload.id)) return state;
      return {
        ...state,
        testCases: [...state.testCases, action.payload],
      };

    case "ADD_TEST_CASES":
      const existingTcIds = new Set(state.testCases.map((tc) => tc.id));
      const newTc = action.payload.filter((tc) => !existingTcIds.has(tc.id));
      return {
        ...state,
        testCases: [...state.testCases, ...newTc],
      };

    case "UPDATE_TEST_CASE":
      return {
        ...state,
        testCases: state.testCases.map((tc) =>
          tc.id === action.payload.id ? action.payload : tc,
        ),
      };

    case "DELETE_TEST_CASE":
      return {
        ...state,
        testCases: state.testCases.filter(
          (tc) => tc.id !== action.payload,
        ),
      };

    case "ADD_AI_TASK":
      return {
        ...state,
        aiTasks: [...state.aiTasks, action.payload],
      };

    case "UPDATE_AI_TASK":
      return {
        ...state,
        aiTasks: state.aiTasks.map((t) =>
          t.id === action.payload.id ? action.payload : t,
        ),
      };

    default:
      return state;
  }
}

// ─── Context ───

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// ─── Selectors（便捷 hooks） ───

export function useProject(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.projects.find((p) => p.id === projectId),
    [state.projects, projectId],
  );
}

export function useProjectRequirements(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.requirements.filter((r) => r.projectId === projectId),
    [state.requirements, projectId],
  );
}

export function useProjectTestPoints(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.testPoints.filter((tp) => tp.projectId === projectId),
    [state.testPoints, projectId],
  );
}

export function useProjectTestCases(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.testCases.filter((tc) => tc.projectId === projectId),
    [state.testCases, projectId],
  );
}

export function useProjectFiles(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.files.filter((f) => f.projectId === projectId),
    [state.files, projectId],
  );
}

export function useProjectAITasks(projectId: string | undefined) {
  const { state } = useStore();
  return useMemo(
    () => state.aiTasks.filter((t) => t.projectId === projectId),
    [state.aiTasks, projectId],
  );
}
