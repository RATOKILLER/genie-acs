// src/AdminProtectedRoute.js
import React from "react";
import { Navigate } from "react-router-dom";
import { hasPermission } from "./permissions";

function AdminProtectedRoute({ children }) {
  const user = localStorage.getItem("user");
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  // Aqui, verifica-se se o usuário possui a permissão "admin"
  if (!hasPermission("admin")) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default AdminProtectedRoute;
