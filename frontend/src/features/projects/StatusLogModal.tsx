import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { statusLogsApi, ApiStatusLog } from "../../api/client";

interface StatusLogModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
}

export function StatusLogModal({ open, onClose, projectId }: StatusLogModalProps) {
  const [logs, setLogs] = useState<ApiStatusLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      setLoading(true);
      statusLogsApi.list(projectId)
        .then(setLogs)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [open, projectId]);

  const formatFieldName = (fieldName: string) => {
    return fieldName === "test_status" ? "测试状态" : "文档状态";
  };

  const formatChangeType = (changeType: string) => {
    return changeType === "auto" ? "自动" : "手动";
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}:${sec}`;
  };

  return (
    <Modal open={open} onClose={onClose} title="状态变更日志" width={600}>
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
            加载中...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
            暂无状态变更记录
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "8px", color: "#64748b" }}>时间</th>
                <th style={{ padding: "8px", color: "#64748b" }}>字段</th>
                <th style={{ padding: "8px", color: "#64748b" }}>变更前</th>
                <th style={{ padding: "8px", color: "#64748b" }}>变更后</th>
                <th style={{ padding: "8px", color: "#64748b" }}>类型</th>
                <th style={{ padding: "8px", color: "#64748b" }}>原因</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", color: "#475569" }}>{formatTime(log.createdAt)}</td>
                  <td style={{ padding: "8px", color: "#475569" }}>{formatFieldName(log.fieldName)}</td>
                  <td style={{ padding: "8px", color: "#475569" }}>{log.oldValue || "-"}</td>
                  <td style={{ padding: "8px", color: "#475569" }}>{log.newValue}</td>
                  <td style={{ padding: "8px", color: "#475569" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      backgroundColor: log.changeType === "auto" ? "#dbeafe" : "#fef3c7",
                      color: log.changeType === "auto" ? "#1e40af" : "#92400e",
                    }}>
                      {formatChangeType(log.changeType)}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#475569", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.reason || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
