import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import App from "./App";
import { TouchPressFeedback } from "./components/TouchPressFeedback";
import "./styles/style.css";
import "./styles/style-v2.css";
import "./styles/style-v3.css";
import "./styles/style-personality.css";
import { restoreSelection } from "./data/cloud";
restoreSelection();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TouchPressFeedback />
      <Routes>
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
