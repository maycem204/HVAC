import axios from "axios";
import { clearAuthSession, getAuthToken } from "./auth-storage";

// 👉 URL backend correcte
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
});

// ✅ Ajouter automatiquement le token JWT
api.interceptors.request.use((config) => {
  const token = getAuthToken();

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
      clearAuthSession();

      // Redirection vers login
      window.location.href = "/";
    }

    return Promise.reject(error);
  }
);

export default api;
