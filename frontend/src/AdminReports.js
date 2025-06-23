// src/AdminReports.js

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { hasPermission } from "./permissions";
import "./AdminCommon.css";
import "./AdminReports.css";

export default function AdminReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // filtros de UI
  const [statusFilter, setStatusFilter] = useState("all"); // all | success | failure
  const [searchSerial, setSearchSerial] = useState("");

  // pega usuário logado do localStorage
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    axios
      .get("http://10.34.250.168:5000/reports/firmware-updates")
      .then((res) => {
        const { successes, failures } = res.data;
        const all = [...successes, ...failures]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setReports(all);
      })
      .catch(() => setError("Erro ao carregar relatórios"))
      .finally(() => setLoading(false));
  }, []);

  // resumo de contagens
  const totalCount   = reports.length;
  const successCount = reports.filter(r => r.success).length;
  const failureCount = reports.filter(r => !r.success).length;

  // relatórios após aplicar filtros
  const filtered = useMemo(() => {
    return reports
      .filter(r => {
        if (statusFilter === "success") return r.success;
        if (statusFilter === "failure") return !r.success;
        return true;
      })
      .filter(r => r.serial.toLowerCase().includes(searchSerial.trim().toLowerCase()));
  }, [reports, statusFilter, searchSerial]);

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja realmente apagar este relatório?")) return;
    try {
      await axios.delete(`http://10.34.250.168:5000/reports/firmware-updates/${id}`);
      setReports((prev) => prev.filter((r) => r._id !== id));
    } catch {
      setError("Falha ao apagar relatório");
    }
  };

  return (
    <div className="settings-container">
      <h2>Relatórios de Atualizações</h2>

      {loading ? (
        <p>Carregando...</p>
      ) : error ? (
        <p className="message-error">{error}</p>
      ) : (
        <>
          {/* Resumo */}
          <div className="report-summary">
            <span>Total: {totalCount}</span>
            <span>Sucessos: {successCount}</span>
            <span>Falhas: {failureCount}</span>
          </div>

          {/* Controles de filtro */}
          <div className="filter-controls">
            <label>
              Status:
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="success">Sucesso</option>
                <option value="failure">Falha</option>
              </select>
            </label>
            <label>
              Buscar Serial:
              <input
                type="text"
                placeholder="Ex: FHTT9D7D7518"
                value={searchSerial}
                onChange={(e) => setSearchSerial(e.target.value)}
              />
            </label>
          </div>

          {/* Tabela */}
          <table className="dashboard-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Serial</th>
                <th>Arquivo</th>
                <th>Status</th>
                <th>Usuário</th>
                {hasPermission("admin") && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((r, idx) => (
                  <tr
                    key={idx}
                    className={r.success ? "row-success" : "row-failure"}
                  >
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td>{r.serial}</td>
                    <td>{r.fileName}</td>
                    <td>{r.success ? "Sucesso" : "Falha"}</td>
                    <td>{r.user}</td>
                    {hasPermission("admin") && (
                      <td>
                        <button
                          className="btn-action"
                          onClick={() => handleDelete(r._id)}
                        >
                          Apagar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={hasPermission("admin") ? 6 : 5} className="no-records">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <button
        className="btn-back"
        style={{ marginTop: 20 }}
        onClick={() => navigate("/admin")}
      >
        Voltar à Administração
      </button>
    </div>
  );
}
