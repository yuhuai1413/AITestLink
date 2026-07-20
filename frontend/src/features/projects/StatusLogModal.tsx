import { useEffect, useState } from "react";
import { Modal } from "../../shared/components/Modal";
import { statusLogsApi, ApiStatusLog } from "../../api/client";
import { StatusPill } from "../../shared/components/StatusPill";
import { formatDateTime } from "../../shared/utils/dateTime";

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

  const formatTime = (dateStr: string) => formatDateTime(dateStr);

  return (
    <Modal open={open} onClose={onClose} title="状态变更日志" width={640}>
      <div className="status-log">
        {loading ? (
          <div className="status-log__empty">
            加载中...
          </div>
        ) : logs.length === 0 ? (
          <div className="status-log__empty">
            暂无状态变更记录
          </div>
        ) : (
          <table className="status-log__table">
            <thead>
              <tr>
                <th>时间</th>
                <th>字段</th>
                <th>变更前</th>
                <th>变更后</th>
                <th>类型</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatTime(log.createdAt)}</td>
                  <td>{formatFieldName(log.fieldName)}</td>
                  <td>{log.oldValue || "-"}</td>
                  <td>{log.newValue}</td>
                  <td>
                    <StatusPill tone={log.changeType === "auto" ? "blue" : "amber"}>{formatChangeType(log.changeType)}</StatusPill>
                  </td>
                  <td className="status-log__reason">
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
