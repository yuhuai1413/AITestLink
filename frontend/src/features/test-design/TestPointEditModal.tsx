import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { useStore } from "../../app/store";
import type { Priority, ReviewStatus, TestPoint, TestPointType } from "../../shared/types/platform";

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
    <Modal open={open} onClose={onClose} title="编辑测试点" width={520}>
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
        </div>
        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">保存</button>
        </div>
      </form>
    </Modal>
  );
}
