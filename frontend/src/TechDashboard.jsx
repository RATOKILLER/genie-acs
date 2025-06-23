import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./App.css";           // seu CSS principal
import "./TechDashboard.css";  // estilos extras

export default function TechDashboard() {
  const [recent, setRecent] = useState([]);
  const [resets, setResets] = useState([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const API = "http://10.34.250.168:5000";

  // Identifica secundários, igual ao Home.js
  const isSecondary = (dev) => {
    const s = dev.meshStatus || "";
    return s.startsWith("Em Mesh") || s.startsWith("Conectado via LAN");
  };

  useEffect(() => {
    axios.get(`${API}/devices`)
      .then(({ data }) => {
        if (Array.isArray(data)) {
          // só primários
          const primaries = data.filter((d) => !isSecondary(d));
          // últimos 10 para o “recent”
          const last10 = primaries.slice(-10);
          setRecent(last10);

          // **só “reset” E online** para o “resets”
          const resetLogins = primaries.filter(
            (d) =>
              (d.pppoeUsername || "").toLowerCase() === "reset" &&
              (d.status || "").toLowerCase() === "online"
          );
          setResets(resetLogins);
        }
      })
      .catch(console.error);
  }, []);

  // Configura o filtro de ≥3 caracteres
  const q = search.trim().toLowerCase();
  const doFilter = q.length >= 3;
  const matches = (v) =>
    typeof v === "string" && v.toLowerCase().includes(q);

  const filteredRecent = doFilter
    ? recent.filter(
        (d) =>
          matches(d.serial) ||
          matches(d.connectionMac) ||
          matches(d.pppoeUsername)
      )
    : recent;

  const filteredResets = doFilter
    ? resets.filter(
        (d) =>
          matches(d.serial) ||
          matches(d.connectionMac)
      )
    : resets;

  // Formata uptime sem segundos
  const fmtUp = (sec) => {
    if (!sec || isNaN(sec)) return "–";
    const d = Math.floor(sec / 86400),
          h = Math.floor((sec % 86400) / 3600),
          m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
  };

  return (
    <div className="tech-dashboard">
      <div className="dashboard-container">
        <h2 className="dashboard-title">Dashboard Técnico</h2>

        <div className="controls-container">
          <input
            type="text"
            className="search-box"
            placeholder="Pesquisar por serial, MAC ou PPPoE…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Últimas CPEs */}
        <section style={{ marginTop: 20 }}>
          <h3>Últimas CPEs</h3>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>SERIAL</th>
                  <th>STATUS</th>
                  <th>MAC</th>
                  <th>PPPoE</th>
                  <th>UPTIME</th>
                  <th>DETALHES</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.length > 0 ? (
                  filteredRecent.map((d) => (
                    <tr key={d.serial}>
                      <td>{d.serial}</td>
                      <td>{d.status}</td>
                      <td>{d.connectionMac || "N/A"}</td>
                      <td>{d.pppoeUsername || "–"}</td>
                      <td>{fmtUp(d.deviceUpTime)}</td>
                      <td>
                        <button
                          className="device-config-button"
                          onClick={() => navigate(`/tech/device/${d.serial}`)}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center" }}>
                      {doFilter ? "Nenhum resultado" : "Nenhuma CPE recente"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* CPEs com login resetado */}
        <section style={{ marginTop: 40 }}>
          <h3>CPEs com PPPoE = “reset” (online)</h3>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>SERIAL</th>
                  <th>STATUS</th>
                  <th>MAC</th>
                  <th>UPTIME</th>
                  <th>DETALHES</th>
                </tr>
              </thead>
              <tbody>
                {filteredResets.length > 0 ? (
                  filteredResets.map((d) => (
                    <tr key={d.serial}>
                      <td>{d.serial}</td>
                      <td>{d.status}</td>
                      <td>{d.connectionMac || "N/A"}</td>
                      <td>{fmtUp(d.deviceUpTime)}</td>
                      <td>
                        <button
                          className="device-config-button"
                          onClick={() => navigate(`/tech/device/${d.serial}`)}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      {doFilter
                        ? "Nenhum resultado"
                        : "Nenhuma CPE com login reset online"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
