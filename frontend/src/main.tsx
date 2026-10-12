import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// mount the React app into <div id="root"> in index.html
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
