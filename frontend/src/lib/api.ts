import axios from "axios";

// 👉 URL backend correcte
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
});

// ✅ Ajouter automatiquement le token JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ✅ Gérer expiration / erreur auth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalide ou expiré
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Redirection vers login
      window.location.href = "/";
    }

    return Promise.reject(error);
  }
);

export default api;
