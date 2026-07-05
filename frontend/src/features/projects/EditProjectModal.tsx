import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Modal } from "../../shared/components/Modal";
import { useAPISync } from "../../api/useAPISync";
import type { Project, TestType } from "../../shared/types/platform";

interface EditProjectModalProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
}

const testTypeOptions: { value: TestType; label: string }[] = [
  { value: "首轮全量测试", label: "首轮全量测试" },
  { value: "回归测试", label: "回归测试" },
  { value: "增量测试", label: "增量测试" },
  { value: "专项测试", label: "专项测试" },
];

export function EditProjectModal({ open, onClose, project }: EditProjectModalProps) {
  const { updateProject } = useAPISync();

  const [name, setName] = useState("");
  const [testType, setTestType] = useState<TestType>("首轮全量测试");
  const [priority, setPriority] = useState<"高" | "中" | "低">("中");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setTestType(project.testType);
      setPriority(project.riskLevel);
      setDescription(project.description);
    }
  }, [open, project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    updateProject(project.id, { name, testType, description, riskLevel: priority }).then(() => {
      toast.success("项目更新成功");
      onClose();
    }).catch((err: Error) => {
      toast.error(err.message || "更新失败");
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="编辑项目" width={520}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            项目名称 *
            <input className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            测试类型 *
            <select className="form-select" value={testType} onChange={(e) => setTestType(e.target.value as TestType)}>
              {testTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            优先级
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value as "高" | "中" | "低")}>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            项目说明
            <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
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
