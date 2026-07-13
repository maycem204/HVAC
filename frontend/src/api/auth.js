import api from "../lib/api";

export const register = async (data) => {
  return await api.post("/register", data);
};

export const login = async (data) => {
  return await api.post("/login", data);
};
