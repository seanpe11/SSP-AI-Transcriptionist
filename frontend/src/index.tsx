import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { setupGlobalShortcuts } from "./shortcuts"

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

setupGlobalShortcuts()

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
