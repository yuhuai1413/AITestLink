import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function useConfigError() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  const showConfigError = useCallback((msg: string) => {
    setMessage(msg);
  }, []);

  const close = useCallback(() => {
    setMessage("");
  }, []);

  const goConfig = useCallback(() => {
    setMessage("");
    navigate("/model-config");
  }, [navigate]);

  const dialog = (
    <ConfirmDialog
      open={!!message}
      title="模型配置异常"
      message={message}
      confirmLabel="去配置"
      onConfirm={goConfig}
      onCancel={close}
      danger={false}
    />
  );

  return { showConfigError, dialog };
}
