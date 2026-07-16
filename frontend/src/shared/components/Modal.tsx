import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  height?: string;
  flushTop?: boolean;
  bodyOverflow?: string;
}

export function Modal({ open, onClose, title, children, footer, width = 520, height, flushTop, bodyOverflow }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayPointerStartedRef = useRef(false);

  // ESC key support
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    overlayPointerStartedRef.current = e.target === overlayRef.current;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (overlayPointerStartedRef.current && e.target === overlayRef.current) onClose();
    overlayPointerStartedRef.current = false;
  };

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        className={`modal-dialog${height ? " modal-dialog--tall" : ""}`}
        style={{ width: `${width}px`, maxWidth: "90vw", ...(height ? { height } : {}) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-dialog__header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className={`modal-dialog__body${flushTop ? " modal-dialog__body--flush-top" : ""}`} style={bodyOverflow !== undefined ? { overflow: bodyOverflow } : undefined}>{children}</div>
        {footer && <div className="modal-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
