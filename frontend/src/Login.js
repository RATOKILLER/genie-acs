// src/Login.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import logo from "./img/Logo TOPNET colorido.png";
import "./Login.css";

function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError("Preencha todos os campos");
      return;
    }
    axios
      .post("http://10.34.250.168:5000/db/login", form)
      .then((res) => {
        const userObj = {
          username: form.username,
          ...res.data.user,
        };
        localStorage.setItem("user", JSON.stringify(userObj));

        // Se precisa trocar a senha
        if (userObj.mustChangePassword) {
          navigate("/change-password", { replace: true });
          return;
        }

        // Redireciona Técnico direto ao dashboard técnico
        if (userObj.permissions.includes("technician")) {
          navigate("/tech", { replace: true });
        } else {
          // Demais perfis seguem para o dashboard principal
          navigate("/", { replace: true });
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Erro no login");
      });
  };

  return (
    <div className="login-container">
      <img src={logo} alt="TopNet ACS" className="login-logo" />
      <h2 className="login-title">TopNet ACS</h2>
      {error && <p className="login-error">{error}</p>}
      <form onSubmit={handleSubmit} className="login-form">
        <label>
          Usuário:
          <input
            type="text"
            name="username"
            value={form.username}
            onChange={handleInputChange}
          />
        </label>
        <label>
          Senha:
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleInputChange}
          />
        </label>
        <button type="submit" className="login-button">
          Login
        </button>
      </form>
    </div>
  );
}

export default Login;
