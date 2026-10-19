import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "@xyflow/react/dist/style.css";
import App from "./App";
import { ReportView } from "./components/ReportView";

const isReportRoute = window.location.pathname.replace(/\/+$/, "") === "/report";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("root element missing");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {isReportRoute ? <ReportView /> : <App />}
  </React.StrictMode>,
);
