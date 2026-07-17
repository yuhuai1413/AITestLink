import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { MenuSelect } from "../../shared/components/MenuSelect";
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
  const [automation, setAutomation] = useState<AutomationFlag>("否");
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
    <Modal open={open} onClose={onClose} title="编辑测试用例" width={640}
      footer={<>
        <button className="ghost-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" onClick={handleSubmit}>保存</button>
      </>}
    >
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
            <MenuSelect value={priority} options={[{ value: "P0", label: "P0" }, { value: "P1", label: "P1" }, { value: "P2", label: "P2" }, { value: "P3", label: "P3" }]} onChange={setPriority} />
          </label>
          <label className="form-label">
            评审状态
            <MenuSelect value={reviewStatus} options={[{ value: "待评审", label: "待评审" }, { value: "已通过", label: "已通过" }, { value: "需修改", label: "需修改" }]} onChange={setReviewStatus} />
          </label>
          <label className="form-label">
            自动化标识
            <MenuSelect value={automation} options={[{ value: "是", label: "是" }, { value: "否", label: "否" }]} onChange={setAutomation} />
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


      </form>
    </Modal>
  );
}
