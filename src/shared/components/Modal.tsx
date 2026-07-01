import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 520 }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      style={{ maxWidth: width }}
      onCancel={onClose}
    >
      <div className="modal-dialog__header">
        <h2>{title}</h2>
        <button className="icon-button" type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="modal-dialog__body">{children}</div>
    </dialog>
  );
}
