import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";

export default function DeviceAuditLogsPage() {
  const { serial } = useParams();
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    fetch(`/audit/logs/device/${encodeURIComponent(serial)}`, {
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
      .catch((err) =>
        setError(`Erro ao carregar logs para ${serial}: ${err.message}`)
      );
  }, [serial]);

  if (error)
    return (
      <div className="settings-container">
        <p className="message-error">{error}</p>
        <Link to="/admin/audit/logs" className="btn-back">
          Voltar
        </Link>
      </div>
    );
  if (logs.length === 0)
    return (
      <div className="settings-container">
        <h2>Logs de Auditoria – {serial}</h2>
        <p>Nenhum log encontrado para esta CPE.</p>
        <Link to="/admin/audit/logs" className="btn-back">
          Voltar
        </Link>
      </div>
    );

  return (
    <div className="settings-container">
      <h2>Logs de Auditoria – {serial}</h2>
      <table className="manage-users-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Usuário</th>
            <th>Ação</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l._id}>
              <td>{new Date(l.timestamp).toLocaleString()}</td>
              <td>{l.user}</td>
              <td>{l.action}</td>
              <td>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(l.details, null, 2)}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link to="/admin/audit/logs" className="btn-back">
        Voltar
      </Link>
    </div>
  );
}
