import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Modal } from "../../shared/components/Modal";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { useAPISync } from "../../api/useAPISync";
import { useUnsavedChanges } from "../../shared/hooks/useUnsavedChanges";
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
const docStatusOptions = ["待解析", "待生成", "生成中", "部分生成", "已完成"];

export function EditProjectModal({ open, onClose, project }: EditProjectModalProps) {
  const { updateProject } = useAPISync();
  const projDirty = useUnsavedChanges();

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
  const docStatusOrder = ["待解析", "待生成", "生成中", "部分生成", "已完成"];

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
      projDirty.markClean();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "更新失败");
    }
  };

  return (
    <>
    <Modal open={open} onClose={() => projDirty.requestClose(onClose)} title="编辑项目" width={640}
      footer={<>
        <button className="ghost-button" type="button" onClick={() => projDirty.requestClose(onClose)}>取消</button>
        <button className="primary-button" type="button" onClick={handleSubmit}>保存</button>
      </>}
    >
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            项目名称 *
            <input className="form-input" type="text" value={name} onChange={(e) => { setName(e.target.value); projDirty.markDirty(); }} required />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            测试类型 *
            <MenuSelect value={testType} options={testTypeOptions} onChange={(value) => { setTestType(value); projDirty.markDirty(); }} required />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            优先级
            <MenuSelect value={priority} options={[{ value: "高", label: "高" }, { value: "中", label: "中" }, { value: "低", label: "低" }]} onChange={(value) => { setPriority(value); projDirty.markDirty(); }} />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            测试状态
            <MenuSelect value={testStatus} options={testStatusOptions.map((s) => ({ value: s, label: s }))} onChange={(value) => { setTestStatus(value); projDirty.markDirty(); }} />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            文档状态
            <MenuSelect value={docStatus} options={docStatusOptions.map((s) => ({ value: s, label: s }))} onChange={(value) => { setDocStatus(value); projDirty.markDirty(); }} />
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            项目说明
            <textarea className="form-textarea" value={description} onChange={(e) => { setDescription(e.target.value); projDirty.markDirty(); }} rows={3} />
          </label>
        </div>

      </form>
    </Modal>
    {projDirty.confirmDialog}
    </>
  );
}
