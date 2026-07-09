// Extend Window for global alert flag
declare global {
  interface Window {
    __alertShown?: boolean;
  }
}

// Global dialog events for non-React contexts (API clients)
export interface ShowAlertEvent {
  title: string;
  message: string;
  type: "alert" | "confirm";
  onConfirm?: () => void;
}

const ALERT_EVENT = "app:show-alert";

export function showAlert(title: string, message: string) {
  window.dispatchEvent(
    new CustomEvent<ShowAlertEvent>(ALERT_EVENT, {
      detail: { title, message, type: "alert" },
    })
  );
}

export function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ShowAlertEvent>(ALERT_EVENT, {
        detail: { title, message, type: "confirm", onConfirm: () => resolve(true) },
      })
    );
    // Also handle cancel via a cancel event
    const cancelHandler = () => { resolve(false); window.removeEventListener("app:alert-cancel", cancelHandler); };
    window.addEventListener("app:alert-cancel", cancelHandler);
  });
}

export function onShowAlert(handler: (e: ShowAlertEvent) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<ShowAlertEvent>).detail);
  window.addEventListener(ALERT_EVENT, listener);
  return () => window.removeEventListener(ALERT_EVENT, listener);
}

export function dismissAlert() {
  window.dispatchEvent(new CustomEvent("app:alert-dismiss"));
}
