import React from "react";
import { useNavigate } from "react-router-dom";
import "./AdminCommon.css";
import "./AdminPage.css";

function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="settings-container">
      <h2>Administração</h2>
      <div className="button-stack">
        <button
          className="btn-action"
          onClick={() => navigate("/admin/users")}
        >
          Usuários
        </button>
        <button
          className="btn-action"
          onClick={() => navigate("/admin/roles")}
        >
          Perfis
        </button>
        <button
          className="btn-action"
          onClick={() => navigate("/admin/settings")}
        >
          Definições
        </button>
        <button
          className="btn-action"
          onClick={() => navigate("/admin/reports")}
        >
          Relatórios
        </button>
        <button
      className="btn-action"
      onClick={() => navigate("/admin/reset-events")}
    >
      Dispositivos Resetados
    </button>
    
              <button
      className="btn-action"
      onClick={() => navigate("/admin/audit/logs")}
    >
      Auditoria de Ações
    </button>
    
      </div>
      <button className="btn-back" onClick={() => navigate("/")}>
        Voltar ao Dashboard
      </button>
    </div>
  );
}

export default AdminPage;
