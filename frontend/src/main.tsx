import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { StoreProvider } from "./app/store";
import "./styles/tailwind.css";
import "./styles/login-theme.css";
import "./styles/global.css";

// 独立域名 aitestlink.cn，无需子路径 basename
const basename = import.meta.env.VITE_BASE_PATH || "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
