import { useState, useCallback } from "react";

/**
 * 未保存更改保护 hook
 * 配合 ConfirmDialog 使用，编辑弹窗关闭时检查是否有未保存的更改
 *
 * 用法:
 *   const { isDirty, markDirty, markClean, requestClose, confirmDialog } = useUnsavedChanges();
 *
 *   // Modal 的 onClose 改为:
 *   <Modal onClose={() => requestClose(() => setEditData(null))} ...>
 *
 *   // 页面底部渲染:
 *   {confirmDialog}
 */
export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  /** 请求关闭：如果有未保存更改，弹出确认框 */
  const requestClose = useCallback((onClose: () => void) => {
    if (isDirty) {
      setPendingClose(() => onClose);
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty]);

  /** 确认关闭（ConfirmDialog 的 onConfirm） */
  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    setIsDirty(false);
    pendingClose?.();
    setPendingClose(null);
  }, [pendingClose]);

  /** 取消关闭（ConfirmDialog 的 onCancel） */
  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPendingClose(null);
  }, []);

  /** ConfirmDialog 组件，直接渲染到页面 */
  const confirmDialog = showConfirm ? (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="confirm-dialog">
        <div className="confirm-dialog__body">
          <div className="confirm-dialog__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <div className="confirm-dialog__text">
            <h3>未保存的更改</h3>
            <p>当前有未保存的更改，确定要关闭吗？关闭后更改将丢失。</p>
          </div>
        </div>
        <div className="confirm-dialog__actions">
          <button className="ghost-button" type="button" onClick={handleCancel}>取消</button>
          <button className="primary-button primary-button--danger" type="button" onClick={handleConfirm}>确认关闭</button>
        </div>
      </div>
    </div>
  ) : null;

  return { isDirty, markDirty, markClean, requestClose, confirmDialog };
}
