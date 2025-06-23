// src/permissions.js
export function hasPermission(permission) {
  const userData = localStorage.getItem("user");
  if (!userData) return false;
  const user = JSON.parse(userData);
  if (user.permissions && Array.isArray(user.permissions)) {
    // Se o usuário possuir "admin", concede todas as permissões
    if (user.permissions.includes("admin")) {
      return true;
    }
    return user.permissions.includes(permission);
  }
  return false;
}
