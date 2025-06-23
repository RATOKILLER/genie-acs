// src/TechnicianProtectedRoute.js
import React from "react";
import { Navigate } from "react-router-dom";
import { hasPermission } from "./permissions";

export default function TechnicianProtectedRoute({ children }) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  if (!user.username) {
    return <Navigate to="/login" replace />;
  }
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  // libera admin OU technician
  if (!(hasPermission("technician") || hasPermission("admin"))) {
    return <Navigate to="/" replace />;
  }
  return children;
}
