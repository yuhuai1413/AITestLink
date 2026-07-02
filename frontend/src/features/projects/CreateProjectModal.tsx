import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../shared/components/Modal";
import { useStore } from "../../app/store";
import type { ProjectStatus, TestType } from "../../shared/types/platform";
import { generateId } from "../../shared/utils/generateId";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const { dispatch } = useStore();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [version, setVersion] = useState("V0.1");
  const [owner, setOwner] = useState("");
  const [testType, setTestType] = useState<TestType>("首轮全量测试");
  const [status, setStatus] = useState<ProjectStatus>("设计中");
  const [riskLevel, setRiskLevel] = useState<"高" | "中" | "低">("中");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = generateId("P");
    const today = new Date().toISOString().slice(0, 10);

    dispatch({
      type: "ADD_PROJECT",
      payload: {
        id,
        name,
        version,
        owner,
        testType,
        status,
        description,
        caseCount: 0,
        passRate: 0,
        riskLevel,
        createdAt: today,
        updatedAt: today,
      },
    });

    setName("");
    setVersion("V0.1");
    setOwner("");
    setTestType("首轮全量测试");
    setStatus("设计中");
    setRiskLevel("中");
    setDescription("");
    onClose();
    navigate(`/projects/${id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="新建项目" width={560}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label">
            项目名称 *
            <input className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：CRM 系统回归测试" required />
          </label>
        </div>

        <div className="form-row form-row--3">
          <label className="form-label">
            当前版本 *
            <input className="form-input" type="text" value={version} onChange={(e) => setVersion(e.target.value)} required />
          </label>
          <label className="form-label">
            负责人 *
            <input className="form-input" type="text" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="姓名或团队" required />
          </label>
          <label className="form-label">
            测试类型 *
            <select className="form-select" value={testType} onChange={(e) => setTestType(e.target.value as TestType)}>
              <option value="首轮全量测试">首轮全量测试</option>
              <option value="回归测试">回归测试</option>
              <option value="增量测试">增量测试</option>
              <option value="专项测试">专项测试</option>
            </select>
          </label>
        </div>

        <div className="form-row form-row--3">
          <label className="form-label">
            项目状态
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              <option value="设计中">设计中</option>
              <option value="执行中">执行中</option>
              <option value="阻塞">阻塞</option>
              <option value="已完成">已完成</option>
            </select>
          </label>
          <label className="form-label">
            风险等级
            <select className="form-select" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as "高" | "中" | "低")}>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="form-label">
            项目说明
            <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目背景和测试目标" rows={3} />
          </label>
        </div>

        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">创建项目</button>
        </div>
      </form>
    </Modal>
  );
}
