import React, { useState, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import "./AdminCommon.css";
import "./ManageUsers.css";

function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState({
    usuario: "",
    senha: "",
    confirmSenha: "",
    perfil: "",
    email: "",
    emailRequired: false,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);

  // Novo estado para edição inline
  const [editingUserId, setEditingUserId] = useState(null);
  const [tempRole, setTempRole] = useState("");

  const baseURL = "http://10.34.250.168:5000";

  const fetchUsers = () => {
    axios.get(`${baseURL}/db/users`)
      .then(res => setUsers(res.data))
      .catch(() => setError("Erro ao buscar usuários"));
  };
  const fetchRoles = () => {
    axios.get(`${baseURL}/db/roles`)
      .then(res => setRoles(res.data))
      .catch(() => setError("Erro ao buscar perfis"));
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  useEffect(() => {
    if (error || message) {
      const timer = setTimeout(() => { setError(""); setMessage(""); }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, message]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    // validações diferentes conforme emailRequired
    if (!form.usuario || !form.perfil) {
      setError("Preencha todos os campos obrigatórios"); 
      return;
    }
    if (form.emailRequired) {
      if (!form.email) {
        setError("Informe o e-mail para envio da senha");
        return;
      }
    } else {
      if (!form.senha || !form.confirmSenha) {
        setError("Preencha senha e confirmação");
        return;
      }
      if (form.senha !== form.confirmSenha) {
        setError("Senhas não conferem");
        return;
      }
    }

    // monta payload
    const payload = {
      username: form.usuario,
      role: form.perfil,
      emailRequired: form.emailRequired,
      ...(form.emailRequired
        ? { email: form.email }
        : { password: form.senha }
      )
    };

    axios.post(`${baseURL}/db/users`, payload)
      .then(() => {
        setMessage("Usuário criado!");
        setForm({
          usuario: "",
          senha: "",
          confirmSenha: "",
          perfil: "",
          email: "",
          emailRequired: false,
        });
        setShowCreateUserModal(false);
        fetchUsers();
      })
      .catch((err) => {
        const msg = err.response?.data?.error || "Erro ao criar usuário";
        setError(msg);
      });
  };

  const handleDelete = (username) => {
    if (!window.confirm(`Deletar ${username}?`)) return;
    axios.delete(`${baseURL}/db/users/${username}`)
      .then(() => { setMessage("Usuário excluído"); fetchUsers(); })
      .catch(() => setError("Erro ao deletar usuário"));
  };

  // Inicia edição de perfil
  const handleEdit = (username, currentRole) => {
    setEditingUserId(username);
    setTempRole(currentRole);
  };

  // Cancela edição
  const handleCancelEdit = () => {
    setEditingUserId(null);
    setTempRole("");
  };

  // Salva novo perfil
  const handleSaveEdit = (username) => {
    if (!tempRole) {
      setError("Selecione um perfil"); return;
    }
    axios.put(`${baseURL}/db/users/${username}`, {
      role: tempRole
    })
      .then(() => {
        setMessage("Perfil atualizado!");
        setEditingUserId(null);
        setTempRole("");
        fetchUsers();
      })
      .catch(() => setError("Erro ao atualizar perfil"));
  };

  return (
    <div className="settings-container">
      <h2>Gerenciar Usuários</h2>
      <h3>Lista de Usuários</h3>
      <div className="button-stack">
        <button
          className="btn-action"
          onClick={() => setShowCreateUserModal(true)}
        >
          Novo Usuário
        </button>
      </div>

      {error && <p className="message-error">{error}</p>}
      {message && <p className="message-success">{message}</p>}

      {showCreateUserModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Criar Usuário</h3>
            <form onSubmit={handleSubmit}>
              <label>
                Usuário:
                <input
                  type="text"
                  name="usuario"
                  value={form.usuario}
                  onChange={handleInputChange}
                />
              </label>

              <label>
                Perfil:
                <select
                  name="perfil"
                  value={form.perfil}
                  onChange={handleInputChange}
                >
                  <option value="">-- selecione --</option>
                  {roles.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r._id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkbox-label">
  <span>Enviar senha por e-mail?</span>
  <input
    type="checkbox"
    name="emailRequired"
    checked={form.emailRequired}
    onChange={handleInputChange}
  />
</label>

              {form.emailRequired ? (
                <label>
                  E-mail:
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleInputChange}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Senha:
                    <input
                      type="password"
                      name="senha"
                      value={form.senha}
                      onChange={handleInputChange}
                    />
                  </label>
                  <label>
                    Confirmar Senha:
                    <input
                      type="password"
                      name="confirmSenha"
                      value={form.confirmSenha}
                      onChange={handleInputChange}
                    />
                  </label>
                </>
              )}

              <div className="modal-buttons">
                <button type="submit" className="btn-save">Criar</button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowCreateUserModal(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {users.length > 0 ? (
        <table className="manage-users-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th className="actions-header">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u._id}</td>
                <td>
                  {editingUserId === u._id ? (
                    <select
                      value={tempRole}
                      onChange={(e) => setTempRole(e.target.value)}
                    >
                      <option value="">-- selecione --</option>
                      {roles.map((r) => (
                        <option key={r._id} value={r._id}>
                          {r._id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    u.roles
                  )}
                </td>
                <td className="actions-cell">
                  {editingUserId === u._id ? (
                    <>
                      <button
                        className="btn-action"
                        onClick={() => handleSaveEdit(u._id)}
                      >
                        Salvar
                      </button>
                      <button
                        className="btn-cancel"
                        onClick={handleCancelEdit}
                        style={{ marginLeft: 8 }}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-action"
                        onClick={() => handleEdit(u._id, u.roles)}
                        style={{ marginRight: 8 }}
                      >
                        Editar
                      </button>
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(u._id)}
                      >
                        Deletar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nenhum usuário cadastrado.</p>
      )}

      <Link to="/admin" className="btn-back">
        Voltar à Administração
      </Link>
    </div>
  );
}

export default ManageUsers;
