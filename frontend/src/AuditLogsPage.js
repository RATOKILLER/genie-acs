import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    fetch("/admin/audit/logs", {
      headers: {
        "Content-Type": "application/json",
        "x-user-role": user.roles,
        "x-username": user.username,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data) => setLogs(data))
      .catch((err) => setError(`Erro ao carregar logs: ${err.message}`));
  }, []);

  if (error)
    return (
      <div className="settings-container">
        <p className="message-error">{error}</p>
        <Link to="/admin" className="btn-back">
          Voltar
        </Link>
      </div>
    );
  if (logs.length === 0)
    return (
      <div className="settings-container">
        <h2>Logs de Auditoria</h2>
        <p>Nenhum log encontrado.</p>
        <Link to="/admin" className="btn-back">
          Voltar
        </Link>
      </div>
    );

  return (
    <div className="settings-container">
      <h2>Logs de Auditoria</h2>
      <table className="manage-users-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>CPE (Serial)</th>
            <th>Usuário</th>
            <th>Ação</th>
            <th>Detalhes</th>
            <th>Por CPE</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log._id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td>{log.serial}</td>
              <td>{log.user}</td>
              <td>{log.action}</td>
              <td>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </td>
              <td>
                <Link to={`/audit/logs/device/${encodeURIComponent(log.serial)}`}>
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link to="/admin" className="btn-back">
        Voltar
      </Link>
    </div>
  );
}
