import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "../../shared/components/Modal";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { useAPISync } from "../../api/useAPISync";
import type { TestType } from "../../shared/types/platform";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

const testTypeOptions: { value: TestType; label: string }[] = [
  { value: "首轮全量测试", label: "首轮全量测试" },
  { value: "回归测试", label: "回归测试" },
  { value: "增量测试", label: "增量测试" },
  { value: "专项测试", label: "专项测试" },
];

const CREATE_PROJECT_FORM_ID = "create-project-form";

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { createProject } = useAPISync();

  const [name, setName] = useState("");
  const [testType, setTestType] = useState<TestType>("首轮全量测试");
  const [priority, setPriority] = useState<"高" | "中" | "低">("中");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProject({ name, testType, description, priority, testStatus: "待测试", docStatus: "待解析" }).then(() => {
      toast.success("项目创建成功");
      setName("");
      setTestType("首轮全量测试");
      setPriority("中");
      setDescription("");
      onClose();
    }).catch((err) => {
      toast.error(err.message || "创建失败，请重试");
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="新建项目" width={640}
      footer={<>
        <button className="ghost-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="submit" form={CREATE_PROJECT_FORM_ID}>创建</button>
      </>}
    >
      <form id={CREATE_PROJECT_FORM_ID} className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            项目名称 *
            <input className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入项目名称" required autoFocus />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            测试类型 *
            <MenuSelect value={testType} options={testTypeOptions} onChange={setTestType} required />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            优先级
            <MenuSelect value={priority} options={[{ value: "高", label: "高" }, { value: "中", label: "中" }, { value: "低", label: "低" }]} onChange={setPriority} />
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            项目说明
            <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目背景和测试目标" rows={3} />
          </label>
        </div>

      </form>
    </Modal>
  );
}
