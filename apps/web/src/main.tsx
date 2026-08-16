import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProductionApp } from "./app/production-app.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("root elementが見つかりません");

createRoot(root).render(
  <StrictMode>
    <ProductionApp />
  </StrictMode>,
);
