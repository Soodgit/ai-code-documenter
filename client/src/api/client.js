import axios from "axios";


const API_BASE = import.meta.env.VITE_API_BASE || "https://devdocs-ai-oal3.onrender.com";


export const api = axios.create({
baseURL: API_BASE + "/api",
withCredentials: true, // so refresh cookie flows
});