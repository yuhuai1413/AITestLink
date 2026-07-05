import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { useStore } from "../../app/store";
import type { AutomationFlag, Priority, ReviewStatus, TestCase } from "../../shared/types/platform";

interface TestCaseEditModalProps {
  open: boolean;
  testCase: TestCase | null;
  onClose: () => void;
}

export function TestCaseEditModal({ open, testCase, onClose }: TestCaseEditModalProps) {
  const { dispatch } = useStore();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("P0");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("待评审");
  const [automation, setAutomation] = useState<AutomationFlag>("待评估");
  const [precondition, setPrecondition] = useState("");
  const [steps, setSteps] = useState("");
  const [testData, setTestData] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (testCase) {
      setTitle(testCase.title);
      setPriority(testCase.priority);
      setReviewStatus(testCase.reviewStatus);
      setAutomation(testCase.automation);
      setPrecondition(testCase.precondition);
      setSteps(testCase.steps);
      setTestData(testCase.testData);
      setExpectedResult(testCase.expectedResult);
      setRemark(testCase.remark);
    }
  }, [testCase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testCase) return;

    dispatch({
      type: "UPDATE_TEST_CASE",
      payload: {
        ...testCase,
        title,
        priority,
        reviewStatus,
        automation,
        precondition,
        steps,
        testData,
        expectedResult,
        remark,
        updatedAt: new Date().toISOString().slice(0, 10),
      },
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="编辑测试用例" width={520}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            用例标题
            <input
              className="form-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="form-row form-row--3">
          <label className="form-label">
            优先级
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
          </label>
          <label className="form-label">
            评审状态
            <select className="form-select" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as ReviewStatus)}>
              <option value="待评审">待评审</option>
              <option value="已通过">已通过</option>
              <option value="需修改">需修改</option>
            </select>
          </label>
          <label className="form-label">
            自动化标识
            <select className="form-select" value={automation} onChange={(e) => setAutomation(e.target.value as AutomationFlag)}>
              <option value="适合">适合</option>
              <option value="不适合">不适合</option>
              <option value="待评估">待评估</option>
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            前置条件
            <textarea className="form-textarea" value={precondition} onChange={(e) => setPrecondition(e.target.value)} rows={2} />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            测试步骤
            <textarea className="form-textarea" value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            测试数据
            <textarea className="form-textarea" value={testData} onChange={(e) => setTestData(e.target.value)} rows={2} />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            预期结果
            <textarea className="form-textarea" value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} rows={3} />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            备注
            <textarea className="form-textarea" value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} />
          </label>
        </div>

        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">保存</button>
        </div>
      </form>
    </Modal>
  );
}
