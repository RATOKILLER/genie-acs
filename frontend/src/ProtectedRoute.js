// src/ProtectedRoute.js
import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // Não logado
  if (!user.username) {
    return <Navigate to="/login" replace />;
  }

  // Troca de senha obrigatória
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // Técnico só acessa /tech
  if (user.permissions.includes("technician")) {
    return <Navigate to="/tech" replace />;
  }

  // Usuários normais seguem
  return children;
}
