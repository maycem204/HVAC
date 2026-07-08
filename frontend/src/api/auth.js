import axios from "axios";

const API_URL = "http://localhost:5000";

export const register = async (data) => {
  return await axios.post(`${API_URL}/register`, data);
};

export const login = async (data) => {
  return await axios.post(`${API_URL}/login`, data);
};