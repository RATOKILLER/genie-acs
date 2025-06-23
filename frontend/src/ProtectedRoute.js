// src/ProtectedRoute.js
import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // N�o logado
  if (!user.username) {
    return <Navigate to="/login" replace />;
  }

  // Troca de senha obrigat�ria
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // T�cnico s� acessa /tech
  if (user.permissions.includes("technician")) {
    return <Navigate to="/tech" replace />;
  }

  // Usu�rios normais seguem
  return children;
}
