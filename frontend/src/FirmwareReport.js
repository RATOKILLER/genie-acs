// src/FirmwareReport.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function FirmwareReport() {
  const [data, setData] = useState({ successes: [], failures: [] });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get("http://10.34.250.168:5000/reports/firmware-updates")
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Carregando relatório…</p>;

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => navigate(-1)}>← Voltar</button>
      <h2>Relatório de Atualizações de Firmware em Massa</h2>

      <h3>✔ Sucesso ({data.successes.length})</h3>
      <table border="1" cellPadding="8" style={{ marginBottom: 20, width: "100%" }}>
        <thead>
          <tr>
            <th>Serial</th>
            <th>Arquivo</th>
            <th>Solicitada em</th>
            <th>Baixado em</th>
          </tr>
        </thead>
        <tbody>
          {data.successes.map((r) => (
            <tr key={r.serial + r.requestedAt}>
              <td>{r.serial}</td>
              <td>{r.fileName}</td>
              <td>{new Date(r.requestedAt).toLocaleString()}</td>
              <td>{r.lastDownload ? new Date(r.lastDownload).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>✖ Falha ({data.failures.length})</h3>
      <table border="1" cellPadding="8" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Serial</th>
            <th>Arquivo</th>
            <th>Solicitada em</th>
            <th>Último Download</th>
          </tr>
        </thead>
        <tbody>
          {data.failures.map((r) => (
            <tr key={r.serial + r.requestedAt}>
              <td>{r.serial}</td>
              <td>{r.fileName}</td>
              <td>{new Date(r.requestedAt).toLocaleString()}</td>
              <td>{r.lastDownload ? new Date(r.lastDownload).toLocaleString() : "nunca"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
