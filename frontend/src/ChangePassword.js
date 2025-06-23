// src/ChangePassword.js

import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import logo from "./img/Logo TOPNET colorido.png";
import "./Login.css";

export default function ChangePassword() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const username = user.username;

  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPwd !== confirm) {
      setError("A confirmação não confere.");
      return;
    }
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).+$/;
    if (!strongRegex.test(newPwd)) {
      setError(
        "Senha deve conter letra minúscula, maiúscula, número e símbolo."
      );
      return;
    }

    try {
      const resp = await axios.post(
        `http://10.34.250.168:5000/db/users/${username}/change-password`,
        { newPassword: newPwd }
      );
      setSuccess(resp.data.message);
      // Remove a flag de troca obrigatória
      localStorage.setItem(
        "user",
        JSON.stringify({ ...user, mustChangePassword: false })
      );
      // Aguarda um instante e volta para login
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Falha ao alterar senha.");
    }
  };

  return (
    <div className="login-container">
      <img src={logo} alt="TopNet ACS" className="login-logo" />
      <h2 className="login-title">Troca de Senha</h2>
      {error && <p className="login-error">{error}</p>}
      {success && <p className="login-error" style={{ color: "green" }}>{success}</p>}
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          Nova senha:
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
          />
        </label>
        <label>
          Confirmar nova senha:
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="login-button">
          Alterar Senha
        </button>
      </form>
    </div>
  );
}
