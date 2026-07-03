import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { StoreProvider } from "./app/store";
import { ToastProvider } from "./features/auth/components/ToastProvider";
import "./styles/tailwind.css";
import "./styles/login-theme.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider />
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
