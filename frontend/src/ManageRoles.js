// src/ManageRoles.js

import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import "./AdminCommon.css";
import "./ManageRoles.css";

function ManageRoles() {
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({ perfil: "", permissions: [] });
  const [editingProfile, setEditingProfile] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const availablePermissions = [
    { key: "admin", label: "Admin (acesso total)" },
    { key: "technician", label: "Técnico" },
    { key: "visualizacao", label: "Visualização" },
    { key: "massFirmwareUpdate", label: "FW em Massa" },
    { key: "configurePPPoe", label: "Configurar PPPoE" },
    { key: "configureWiFi", label: "Configurar Wi-Fi" },
    { key: "updateFirmware", label: "Atualizar CPE" },
    { key: "rebootCPE", label: "Reiniciar CPE" },
    { key: "setMultiAP", label: "Configurar MultiAP" },
    { key: "factoryResetCPE", label: "Redefinir Fábrica" },
    { key: "configureNetwork", label: "Configuração Lan" },
  ];

  const baseURL = "http://10.34.250.168:5000";

  // Carrega os perfis
  const fetchRoles = () => {
    axios.get(`${baseURL}/db/roles`)
      .then(res => setRoles(res.data))
      .catch(() => setError("Erro ao buscar perfis"));
  };
  useEffect(fetchRoles, []);

  // Limpa mensagens após 3s
  useEffect(() => {
    if (error || message) {
      const t = setTimeout(() => { setError(""); setMessage(""); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, message]);

  // Atualiza o form de criar
  const handleInputChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Trata seleção de permissão
  const handlePermissionChange = (key, checked, setter, current) => {
    if (key === "visualizacao" && checked) {
      setter({ ...current, permissions: ["visualizacao"] });
    } else if (key === "visualizacao" && !checked) {
      setter({ ...current, permissions: current.permissions.filter(p => p !== "visualizacao") });
    } else {
      if (current.permissions.includes("visualizacao")) {
        alert("Não é permitido combinar outras permissões com Visualização.");
        return;
      }
      setter({
        ...current,
        permissions: checked
          ? [...current.permissions, key]
          : current.permissions.filter(p => p !== key),
      });
    }
  };

  // Cria um novo perfil
  const handleCreate = e => {
    e.preventDefault();
    if (!form.perfil || form.permissions.length === 0) {
      setError("Preencha nome e selecione ao menos 1 permissão");
      return;
    }
    axios.post(`${baseURL}/db/roles`, {
      roleName: form.perfil,
      permissions: form.permissions,
    })
    .then(() => {
      setMessage("Perfil criado!");
      setShowCreateModal(false);
      setForm({ perfil: "", permissions: [] });
      fetchRoles();
    })
    .catch(err => {
      setError(err.response?.data?.error || "Erro ao criar perfil");
    });
  };

  // Abre modal de edição
  const openEdit = profile => {
    setEditingProfile({ perfil: profile._id, permissions: [...profile.permissions] });
  };

  // Atualiza perfil existente
  const handleUpdate = e => {
    e.preventDefault();
    if (!editingProfile.permissions.length) {
      setError("Selecione ao menos 1 permissão");
      return;
    }
    axios.put(`${baseURL}/db/roles/${editingProfile.perfil}`, {
      permissions: editingProfile.permissions,
    })
    .then(() => {
      setMessage("Perfil atualizado!");
      setEditingProfile(null);
      fetchRoles();
    })
    .catch(err => {
      setError(err.response?.data?.error || "Erro ao atualizar perfil");
    });
  };

  // Remove um perfil
  const handleDelete = roleName => {
    if (!window.confirm(`Excluir perfil "${roleName}"?`)) return;
    axios.delete(`${baseURL}/db/roles/${roleName}`)
      .then(() => {
        setMessage("Perfil excluído");
        fetchRoles();
      })
      .catch(() => setError("Erro ao deletar perfil"));
  };

  return (
    <div className="settings-container manage-roles-container">
      <h2>Gerenciar Perfis</h2>

      <div className="button-stack">
        <button
          className="btn-action"
          onClick={() => setShowCreateModal(true)}
        >
          Novo Perfil
        </button>
      </div>

      {error && <p className="message-error">{error}</p>}
      {message && <p className="message-success">{message}</p>}

      {/* Modal Criar Perfil */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Criar Perfil</h3>
            <form onSubmit={handleCreate}>
              <label>
                Nome do Perfil:
                <input
                  type="text"
                  name="perfil"
                  value={form.perfil}
                  onChange={handleInputChange}
                />
              </label>
              <div>
                <strong>Permissões:</strong>
                {availablePermissions.map(perm => (
                  <div key={perm.key} className="checkbox-row">
                    <input
                      id={`create-${perm.key}`}
                      type="checkbox"
                      checked={form.permissions.includes(perm.key)}
                      onChange={e =>
                        handlePermissionChange(
                          perm.key,
                          e.target.checked,
                          setForm,
                          form
                        )
                      }
                    />
                    <label htmlFor={`create-${perm.key}`}>{perm.label}</label>
                  </div>
                ))}
              </div>
              <div className="modal-buttons">
                <button type="submit" className="btn-save">Criar</button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Perfil */}
      {editingProfile && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Editar Perfil</h3>
            <form onSubmit={handleUpdate}>
              <label>
                Nome do Perfil:
                <input
                  type="text"
                  name="perfil"
                  value={editingProfile.perfil}
                  disabled
                />
              </label>
              <div>
                <strong>Permissões:</strong>
                {availablePermissions.map(perm => (
                  <div key={perm.key} className="checkbox-row">
                    <input
                      id={`edit-${perm.key}`}
                      type="checkbox"
                      checked={editingProfile.permissions.includes(perm.key)}
                      onChange={e =>
                        handlePermissionChange(
                          perm.key,
                          e.target.checked,
                          setEditingProfile,
                          editingProfile
                        )
                      }
                    />
                    <label htmlFor={`edit-${perm.key}`}>{perm.label}</label>
                  </div>
                ))}
              </div>
              <div className="modal-buttons">
                <button type="submit" className="btn-save">Atualizar</button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setEditingProfile(null)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h3>Lista de Perfis</h3>
      {roles.length > 0 ? (
        <table className="manage-users-table">
          <thead>
            <tr>
              <th>Perfil</th>
              <th>Permissões</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r._id}>
                <td>{r._id}</td>
                <td>
                  {Array.isArray(r.permissions)
                    ? r.permissions.join(", ")
                    : r.permissions}
                </td>
                <td>
                  <button
                    className="btn-action"
                    onClick={() => openEdit(r)}
                    style={{ marginRight: 8 }}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => handleDelete(r._id)}
                  >
                    Deletar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nenhum perfil cadastrado.</p>
      )}

      <Link to="/admin" className="btn-back">
        Voltar à Administração
      </Link>
    </div>
  );
}

export default ManageRoles;
