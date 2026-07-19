import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { StoreProvider } from "./app/store";
import "./styles/tailwind.css";
import "./styles/login-theme.css";
import "./styles/global.css";

// 本地开发时 basename 为空，生产环境使用 /aitestlink
const basename = import.meta.env.DEV ? "" : (import.meta.env.VITE_BASE_PATH || "/aitestlink");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
