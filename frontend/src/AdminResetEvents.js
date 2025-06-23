// src/AdminResetEvents.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./AdminResetEvents.css";

export default function AdminResetEvents() {
  const [events, setEvents]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const navigate              = useNavigate();

  useEffect(() => {
    axios
      .get("http://10.34.250.168:5000/api/reset-events")
      .then((res) => setEvents(res.data))
      .catch(() => setError("Erro ao carregar eventos"))
      .finally(() => setLoading(false));
  }, []);

  const handleProcess = async (id) => {
    try {
      await axios.post(`http://10.34.250.168:5000/api/reset-events/${id}/process`);
      setEvents((prev) => prev.filter((e) => e._id !== id));
    } catch {
      alert("Falha ao marcar como resolvido");
    }
  };

  // Estados de carregamento/erro
  if (loading) return <p style={{ textAlign: "center" }}>Carregando…</p>;
  if (error)   return <p style={{ textAlign: "center", color: "red" }}>{error}</p>;

  // Se a resposta não for array
  if (!Array.isArray(events)) {
    return (
      <div className="settings-container reset-events-wrapper">
        <h2>Dispositivos Resetados</h2>
        <p style={{ textAlign: "center", color: "red" }}>
          Resposta inesperada do servidor.
        </p>
        <button className="btn-back" onClick={() => navigate("/admin")}>
          Voltar à Administração
        </button>
      </div>
    );
  }

  // Sem eventos pendentes
  if (events.length === 0) {
    return (
      <div className="settings-container reset-events-wrapper">
        <h2>Dispositivos Resetados</h2>
        <p style={{ textAlign: "center" }}>Nenhum evento de reset pendente.</p>
        <button className="btn-back" onClick={() => navigate("/admin")}>
          Voltar à Administração
        </button>
      </div>
    );
  }

  // Tabela de eventos
  return (
    <div className="settings-container reset-events-wrapper">
      <h2>Dispositivos Resetados</h2>
      <table className="reset-events-table">
        <colgroup>
          <col/>
          <col/>
          <col/>
          <col/>
          <col/>
          <col/>
        </colgroup>
        <thead>
          <tr>
            <th>Data / Hora do Reset</th>
            <th>Serial</th>
            <th>MAC Conexão</th>
            <th>PPPoE Antes</th>
            <th>PPPoE Depois</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td>{new Date(e.resetAt).toLocaleString()}</td>
              <td>{e.serial}</td>
              <td>{e.connectionMac}</td>
              <td>{e.linkedConfig?.pppoeUsername || "-"}</td>
              <td>{e.resetConfig?.pppoeUsername || "-"}</td>
              <td className="actions-cell">
                <button
                  className="device-config-button"
                  onClick={() => handleProcess(e._id)}
                >
                  Marcar como Resolvido
                </button>
                <button
                  className="device-config-button"
                  onClick={() => navigate(`/admin/reset-events/devices/${e.serial}`)}
                >
                  Configurar Dispositivo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn-back" style={{ marginTop: 16 }} onClick={() => navigate("/admin")}>
        Voltar à Administração
      </button>
    </div>
  );
}
