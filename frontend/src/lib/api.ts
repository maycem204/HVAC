import axios from "axios";

// 👉 URL backend correcte
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  withCredentials: true,
});

// ✅ Gérer expiration / erreur auth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const publicAuthRoutes = ["/me", "/login", "/register"];
      if (!publicAuthRoutes.includes(error.config?.url)) window.location.href = "/";
    }

    return Promise.reject(error);
  }
);

export default api;
