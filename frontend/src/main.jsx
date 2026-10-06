import { StrictMode } from "react";
// Prevent the mouse wheel from silently changing focused number inputs
window.addEventListener(
  "wheel",
  () => {
    if (document.activeElement && document.activeElement.type === "number") {
      document.activeElement.blur();
    }
  },
  { passive: true },
);
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
