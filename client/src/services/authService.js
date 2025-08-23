import { api } from "../api/client";


export async function login(email, password) {
const { data } = await api.post("/auth/login", { email, password });
// Store access token in memory/localStorage (NOT httpOnly cookie)
localStorage.setItem("access_token", data.token);
return data.user;
}


export async function register(username, email, password) {
const { data } = await api.post("/auth/register", { username, email, password });
return data;
}


export async function logout() {
localStorage.removeItem("access_token");
await api.post("/auth/logout");
}


export async function getAccessToken() {
const token = localStorage.getItem("access_token");
return token;
}


export async function refresh() {
const { data } = await api.post("/auth/refresh");
localStorage.setItem("access_token", data.token);
return data.token;
}