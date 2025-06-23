// src/App.js
import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";

import DashboardHome from "./DashboardHome";
import Home from "./Home";
import DeviceConfig from "./DeviceConfig";
import ResetDeviceConfig from "./ResetDeviceConfig";
import AdminPage from "./AdminPage";
import ManageUsers from "./ManageUsers";
import ManageRoles from "./ManageRoles";
import AdminSettings from "./AdminSettings";
import AdminReports from "./AdminReports";
import AdminResetEvents from "./AdminResetEvents";
import AuditLogsPage         from "./AuditLogsPage";
import DeviceAuditLogsPage   from "./DeviceAuditLogsPage";
import Login from "./Login";
import ChangePassword from "./ChangePassword";
import TechDashboard from "./TechDashboard";
import TechnicianConfig from "./TechnicianConfig";

import ProtectedRoute from "./ProtectedRoute";
import AdminProtectedRoute from "./AdminProtectedRoute";
import TechnicianProtectedRoute from "./TechnicianProtectedRoute"; // ← novo

function App() {
  return (
    <Router>
      <Routes>

        {/* troca de senha */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {/* login público */}
        <Route path="/login" element={<Login />} />

        {/* dashboard principal / Home */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/devices/:serial"
          element={
            <ProtectedRoute>
              <DeviceConfig />
            </ProtectedRoute>
          }
        />

        {/* Reset Events → Configuração específica */}
        <Route
          path="/admin/reset-events/devices/:serial"
          element={
            <AdminProtectedRoute>
              <ResetDeviceConfig />
            </AdminProtectedRoute>
          }
        />

        {/* Administração (somente admins) */}
        <Route
          path="/admin"
          element={
            <AdminProtectedRoute>
              <AdminPage />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminProtectedRoute>
              <ManageUsers />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <AdminProtectedRoute>
              <ManageRoles />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <AdminProtectedRoute>
              <AdminSettings />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <AdminProtectedRoute>
              <AdminReports />
            </AdminProtectedRoute>
          }
        />
        <Route
          path="/admin/reset-events"
          element={
            <AdminProtectedRoute>
              <AdminResetEvents />
            </AdminProtectedRoute>
          }
        />
        
          <Route
    path="/admin/audit/logs"
    element={
      <AdminProtectedRoute>
        <AuditLogsPage />
      </AdminProtectedRoute>
    }
  />
  <Route
    path="/admin/audit/device/:serial"
    element={
      <AdminProtectedRoute>
        <DeviceAuditLogsPage />
      </AdminProtectedRoute>
    }
  />

        {/* Dashboard Técnico (somente técnicos) */}
        <Route
          path="/tech"
          element={
            <TechnicianProtectedRoute>
              <TechDashboard />
            </TechnicianProtectedRoute>
          }
        />
        <Route
          path="/tech/device/:serial"
          element={
            <TechnicianProtectedRoute>
              <TechnicianConfig />
            </TechnicianProtectedRoute>
          }
        />

      </Routes>
    </Router>
  );
}

export default App;
