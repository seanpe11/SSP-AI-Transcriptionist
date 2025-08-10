import React from "react";
import ReactDOM from "react-dom/client";
import App from "./Gemini";
// import App from "./Ideal";
// import App from "./Claude";
// import App from "./ResponseA";
// import App from "./ResponseB";
// import App from "./ResponseC";

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
