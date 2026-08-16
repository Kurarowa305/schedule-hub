import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProductionAppWithSettings } from "./app/production-app-with-settings.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("root elementが見つかりません");

createRoot(root).render(
  <StrictMode>
    <ProductionAppWithSettings />
  </StrictMode>,
);
