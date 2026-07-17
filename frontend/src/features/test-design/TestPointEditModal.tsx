import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { useStore } from "../../app/store";
import type { Priority, ReviewStatus, TestPoint } from "../../shared/types/platform";

interface TestPointEditModalProps {
  open: boolean;
  testPoint: TestPoint | null;
  onClose: () => void;
}

export function TestPointEditModal({ open, testPoint, onClose }: TestPointEditModalProps) {
  const { dispatch } = useStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("P0");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("待评审");

  useEffect(() => {
    if (testPoint) {
      setTitle(testPoint.title);
      setDescription(testPoint.description);
      setPriority(testPoint.priority);
      setReviewStatus(testPoint.reviewStatus);
    }
  }, [testPoint]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPoint) return;
    dispatch({
      type: "UPDATE_TEST_POINT",
      payload: {
        ...testPoint,
        title,
        description,
        priority,
        reviewStatus,
      },
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="编辑测试点" width={640}
      footer={<>
        <button className="ghost-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" onClick={handleSubmit}>保存</button>
      </>}
    >
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            测试点标题
            <input className="form-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            测试点描述
            <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
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
        </div>

      </form>
    </Modal>
  );
}
