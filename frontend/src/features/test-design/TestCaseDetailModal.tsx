import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { priorityTone, reviewTone } from "../../shared/utils/statusTone";
import { formatDateTime } from "../../shared/utils/dateTime";
import type { TestCase } from "../../shared/types/platform";

interface TestCaseDetailModalProps {
  open: boolean;
  testCase: TestCase | null;
  onClose: () => void;
}

function formatTime(iso: string | undefined): string {
  return formatDateTime(iso);
}

export function TestCaseDetailModal({ open, testCase, onClose }: TestCaseDetailModalProps) {
  if (!testCase) return null;

  return (
    <Modal open={open} onClose={onClose} title="用例详情" width={640}>
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
          <span className="detail-label">测试端</span>
          <span>{testCase.targetPlatform}</span>
        </div>
        <div className="detail-row detail-row--full">
          <span className="detail-label">测试地址</span>
          <span style={{ overflowWrap: "anywhere" }}>{testCase.testUrl || "未配置"}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">所需角色</span>
          <span>{testCase.requiredRole || "无"}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">评审状态</span>
          <StatusPill tone={reviewTone(testCase.reviewStatus)}>{testCase.reviewStatus}</StatusPill>
        </div>
        <div className="detail-row">
          <span className="detail-label">是否自动化</span>
          <span>{testCase.automation === "是" ? "是" : "否"}</span>
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
