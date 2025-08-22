// src/api/client.js
import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

const client = axios.create({ baseURL: `${API_BASE_URL}/api` });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // 👈 SAME KEY
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
