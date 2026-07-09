import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { onShowAlert, dismissAlert, type ShowAlertEvent } from "../utils/dialogEvents";

export function GlobalAlert() {
  const [event, setEvent] = useState<ShowAlertEvent | null>(null);

  useEffect(() => {
    return onShowAlert((e) => setEvent(e));
  }, []);

  if (!event) return null;

  const handleConfirm = () => {
    event.onConfirm?.();
    setEvent(null);
    dismissAlert();
    (window as any).__alertShown = false;
    window.location.href = "/login";
  };

  const handleCancel = () => {
    window.dispatchEvent(new CustomEvent("app:alert-cancel"));
    setEvent(null);
    dismissAlert();
    (window as any).__alertShown = false;
    window.location.href = "/login";
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="confirm-dialog">
        <div className="confirm-dialog__body">
          <div className="confirm-dialog__icon">
            <AlertTriangle size={22} />
          </div>
          <div className="confirm-dialog__text">
            <h3>{event.title}</h3>
            <p>{event.message}</p>
          </div>
        </div>
        <div className="confirm-dialog__actions">
          {event.type === "confirm" && (
            <button className="ghost-button" type="button" onClick={handleCancel}>
              取消
            </button>
          )}
          <button className="primary-button primary-button--danger" type="button" onClick={handleConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
