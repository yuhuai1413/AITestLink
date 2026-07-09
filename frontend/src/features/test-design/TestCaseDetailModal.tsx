import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import type { TestCase } from "../../shared/types/platform";

interface TestCaseDetailModalProps {
  open: boolean;
  testCase: TestCase | null;
  onClose: () => void;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function priorityTone(p: string) {
  if (p === "P0") return "red" as const;
  if (p === "P1") return "amber" as const;
  if (p === "P2") return "blue" as const;
  return "slate" as const;
}

function reviewTone(s: string) {
  if (s === "已通过") return "green" as const;
  if (s === "需修改") return "red" as const;
  return "amber" as const;
}

export function TestCaseDetailModal({ open, testCase, onClose }: TestCaseDetailModalProps) {
  if (!testCase) return null;

  return (
    <Modal open={open} onClose={onClose} title="用例详情" width={520}>
      <div className="detail-grid">
        <div className="detail-row">
          <span className="detail-label">用例编号</span>
          <span>{testCase.caseCode}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">模块</span>
          <span>{testCase.module}</span>
        </div>
        <div className="detail-row detail-row--full">
          <span className="detail-label">测试点</span>
          <span>{testCase.feature}</span>
        </div>
        <div className="detail-row detail-row--full">
          <span className="detail-label">用例标题</span>
          <span>{testCase.title}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">优先级</span>
          <StatusPill tone={priorityTone(testCase.priority)}>{testCase.priority}</StatusPill>
        </div>
        <div className="detail-row">
          <span className="detail-label">测试类型</span>
          <span>{testCase.testType || "功能测试"}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">评审状态</span>
          <StatusPill tone={reviewTone(testCase.reviewStatus)}>{testCase.reviewStatus}</StatusPill>
        </div>
        <div className="detail-row">
          <span className="detail-label">是否自动化</span>
          <span>{testCase.automation === "适合" ? "是" : "否"}</span>
        </div>
        <div className="detail-row detail-row--full">
          <span className="detail-label">测试步骤</span>
          <pre className="detail-pre">{testCase.steps}</pre>
        </div>
        <div className="detail-row detail-row--full">
          <span className="detail-label">预期结果</span>
          <pre className="detail-pre">{testCase.expectedResult}</pre>
        </div>
        <div className="detail-row">
          <span className="detail-label">生成时间</span>
          <span>{formatTime(testCase.createdAt)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">更新时间</span>
          <span>{formatTime(testCase.updatedAt)}</span>
        </div>
      </div>
    </Modal>
  );
}
