import { Toaster, toast } from "sonner";

const TOASTER_OPTIONS = {
  position: "top-center" as const,
  richColors: true,
  toastOptions: {
    style: {
      top: "60px",
      borderRadius: "16px",
      fontSize: "14px",
      fontWeight: 500,
    },
  },
};

/** 统一的 Toast 容器 — 在 App 根节点渲染一次即可 */
export function ToastProvider() {
  return <Toaster {...TOASTER_OPTIONS} />;
}

/** 导出 toast 方法供业务代码使用 */
export { toast };
