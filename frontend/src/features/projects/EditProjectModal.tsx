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

const testStatusOptions = ["待测试", "测试中", "已测试"];
const docStatusOptions = ["待生成", "生成中", "已完成"];

export function EditProjectModal({ open, onClose, project }: EditProjectModalProps) {
  const { updateProject } = useAPISync();

  const [name, setName] = useState("");
  const [testType, setTestType] = useState<TestType>("首轮全量测试");
  const [priority, setPriority] = useState<"高" | "中" | "低">("中");
  const [testStatus, setTestStatus] = useState("待测试");
  const [docStatus, setDocStatus] = useState("待解析");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setTestType(project.testType);
      setPriority(project.priority);
      setTestStatus(project.testStatus);
      setDocStatus(project.docStatus);
      setDescription(project.description);
    }
  }, [open, project]);

  // 检查是否为状态回退操作
  const isStatusRegression = (oldStatus: string, newStatus: string, statusOrder: string[]) => {
    const oldIndex = statusOrder.indexOf(oldStatus);
    const newIndex = statusOrder.indexOf(newStatus);
    return oldIndex > newIndex;
  };

  const testStatusOrder = ["待测试", "测试中", "已测试"];
  const docStatusOrder = ["待生成", "生成中", "已完成"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    
    // 检查状态回退
    const isTestRegression = isStatusRegression(project.testStatus, testStatus, testStatusOrder);
    const isDocRegression = isStatusRegression(project.docStatus, docStatus, docStatusOrder);
    
    if (isTestRegression || isDocRegression) {
      // 确认回退操作
      const confirmMessage = [];
      if (isTestRegression) {
        confirmMessage.push(`测试状态将从「${project.testStatus}」回退到「${testStatus}」`);
      }
      if (isDocRegression) {
        confirmMessage.push(`文档状态将从「${project.docStatus}」回退到「${docStatus}」`);
      }
      
      if (!window.confirm(`检测到状态回退操作：\n\n${confirmMessage.join('\n')}\n\n确定要继续吗？`)) {
        return;
      }
    }
    
    try {
      await updateProject(project.id, { name, testType, description, priority, testStatus, docStatus });
      toast.success("项目更新成功");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "更新失败");
    }
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
            测试状态
            <select className="form-select" value={testStatus} onChange={(e) => setTestStatus(e.target.value)}>
              {testStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            文档状态
            <select className="form-select" value={docStatus} onChange={(e) => setDocStatus(e.target.value)}>
              {docStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
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
