import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./AdminSettings.css";

function AdminSettings() {
  const [massUpdateLimit, setMassUpdateLimit] = useState("50");
  const [message, setMessage] = useState("");
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeDays, setRemoveDays] = useState("1");
  const [removeError, setRemoveError] = useState("");

  // Carrega o limite salvo
  useEffect(() => {
    const stored = localStorage.getItem("massUpdateLimit");
    if (stored) setMassUpdateLimit(stored);
  }, []);

  // Salva o limite de atualização em massa
  const handleSaveLimit = (e) => {
    e.preventDefault();
    const num = parseInt(massUpdateLimit, 10);
    if (isNaN(num) || num < 1) {
      setMessage("Insira um valor inteiro maior que zero.");
      return;
    }
    localStorage.setItem("massUpdateLimit", num);
    setMessage("Limite atualizado com sucesso!");
    setShowLimitModal(false);
  };

  // Chama a API para remover CPEs offline
  const handleRemoveCPEs = async () => {
    setRemoveError("");
    try {
      const resp = await fetch("http://10.34.250.168:5000/removeOfflineCPEs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdDays: parseInt(removeDays, 10) }),
      });
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setRemoveError(`Removidas ${data.removed} CPEs.`);
      setShowRemoveModal(false);
    } catch {
      setRemoveError("Erro ao remover CPEs.");
    }
  };

  return (
    <div className="settings-container">
      <h2>Definições do ACS</h2>

      <div className="button-stack">
        <button className="btn-action" onClick={() => setShowLimitModal(true)}>
          Limite em Massa
        </button>
        <button className="btn-action" onClick={() => setShowRemoveModal(true)}>
          Remover Offline
        </button>
      </div>

      {message && <p className="message-success">{message}</p>}
      {removeError && <p className="message-error">{removeError}</p>}

      {/* Modal: configurar limite */}
      {showLimitModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Configurar Limite</h3>
            <form onSubmit={handleSaveLimit}>
              <label>
                Limite de CPEs:
                <input
                  type="number"
                  value={massUpdateLimit}
                  onChange={(e) => setMassUpdateLimit(e.target.value)}
                />
              </label>
              <div className="modal-buttons">
                <button type="submit" className="btn-save">
                  Salvar
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowLimitModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: remover offline */}
      {showRemoveModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Remover CPEs Offline</h3>
            <label>
              Dias offline:
              <input
                type="number"
                value={removeDays}
                onChange={(e) => setRemoveDays(e.target.value)}
              />
            </label>
            <div className="modal-buttons">
              <button className="btn-save" onClick={handleRemoveCPEs}>
                Confirmar
              </button>
              <button
                className="btn-cancel"
                onClick={() => setShowRemoveModal(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/admin" className="btn-back">
        Voltar à Administração
      </Link>
    </div>
  );
}

export default AdminSettings;
