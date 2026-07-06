import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import { StoreProvider } from "./app/store";
import "./styles/tailwind.css";
import "./styles/login-theme.css";
import "./styles/components/sidebar.css";
import "./styles/components/topbar.css";
import "./styles/components/buttons.css";
import "./styles/components/metric-card.css";
import "./styles/components/data-table.css";
import "./styles/components/status-pill.css";
import "./styles/components/hero-panel.css";
import "./styles/components/work-panel.css";
import "./styles/components/modal.css";
import "./styles/components/forms.css";
import "./styles/components/search-results.css";
import "./styles/components/detail-view.css";
import "./styles/components/tab-bar.css";
import "./styles/components/model-config.css";
import "./styles/components/user-menu.css";
import "./styles/components/edit-tabs.css";
import "./styles/components/dashboard.css";
import "./styles/components/confirm-dialog.css";
import "./styles/components/toast.css";
import "./styles/components/animations.css";
import "./styles/components/login-visual.css";
import "./styles/components/search-form.css";
import "./styles/components/pagination.css";
import "./styles/components/data-panel.css";
import "./styles/components/overview-grid.css";
import "./styles/components/info-grid.css";
import "./styles/components/filter-bar.css";
import "./styles/components/empty-state.css";
import "./styles/components/batch-bar.css";
import "./styles/components/warning-list.css";
import "./styles/components/roadmap.css";
import "./styles/components/process-strip.css";
import "./styles/components/timeline.css";
import "./styles/components/help-modal.css";
import "./styles/components/utility.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
