import axios from "axios";

const API = axios.create({ baseURL: "http://localhost:5000/api" });

const register        = (username, email, password) => API.post("/auth/register", { username, email, password });
const login           = (email, password)           => API.post("/auth/login", { email, password });
const forgotPassword  = (email)                      => API.post("/auth/forgot-password", { email });
const resetPassword   = (token, password)            => API.post(`/auth/reset-password/${token}`, { password });

export default { register, login, forgotPassword, resetPassword };
