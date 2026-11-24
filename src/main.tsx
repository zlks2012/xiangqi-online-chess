import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA：注册 Service Worker 实现离线可玩（原生 APK 内无 SW，自动跳过）
if ("serviceWorker" in navigator && !/capacitor:/i.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => undefined);
  });
}
