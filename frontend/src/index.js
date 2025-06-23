// src/index.js

import React from "react";
// React 18+: pegamos o createRoot do pacote client
import { createRoot } from "react-dom/client";
import App from "./App";

// 1?? Se o usuário entrou em "/devices" sem hash,
//    redireciona para "/#/devices" antes de montar o React
const { pathname, hash, search } = window.location;
if (!hash && pathname !== "/") {
  window.location.replace(`/#${pathname}${search}`);
} else {
  // 2?? Monta o React usando a nova API
  const container = document.getElementById("root");
  const root = createRoot(container);
  root.render(<App />);
}
