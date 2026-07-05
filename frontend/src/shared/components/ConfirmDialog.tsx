import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-dialog">
        <div className="confirm-dialog__body">
          <div className="confirm-dialog__icon">
            <AlertTriangle size={22} />
          </div>
          <div className="confirm-dialog__text">
            <h3>{title}</h3>
            <p>{message}</p>
          </div>
        </div>
        <div className="confirm-dialog__actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className={`primary-button ${danger ? "primary-button--danger" : ""}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
