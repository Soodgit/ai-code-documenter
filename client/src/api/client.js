import axios from "axios";


const API_BASE = import.meta.env.VITE_API_BASE || "https://ai-code-documenter-backend.vercel.app";


export const api = axios.create({
baseURL: API_BASE + "/api",
withCredentials: true, // so refresh cookie flows
});