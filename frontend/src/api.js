import axios from "axios";

// captura usuário e role do localStorage (ou de onde estiverem armazenados)
const stored = JSON.parse(localStorage.getItem("user") || "{}");
const username = stored.username || "";
const role     = stored.roles    || "";

const api = axios.create({
  baseURL: "/",   // ajuste se necessário
  headers: {
    "x-username":   username,
    "x-user-role":  role,
  },
});

export default api;
