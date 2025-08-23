// src/lib/api.js
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Main API client (all app requests go through this)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // if your refresh token is a cookie
});

// A dedicated client for refresh calls to avoid interceptor loops
const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

/** --- Small helpers ------------------------------------------------------ */
export function setAuthToken(token) {
  if (token) {
    localStorage.setItem("token", token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    localStorage.removeItem("token");
  }
}

export function clearAuth() {
  delete api.defaults.headers.common.Authorization;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

/** --- Attach token to every request ------------------------------------- */
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/** --- 401 refresh logic (single flight + queue) ------------------------- */
let isRefreshing = false;
let waitQueue = [];

// Resolve all queued requests with new token
function resolveQueue(token) {
  waitQueue.forEach(({ resolve }) => resolve(token));
  waitQueue = [];
}
// Reject all queued requests
function rejectQueue(err) {
  waitQueue.forEach(({ reject }) => reject(err));
  waitQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;

    // If request has no config or already retried → just fail
    if (!original || original._retry) return Promise.reject(error);

    // Try refresh exactly once on 401
    if (status === 401) {
      original._retry = true;

      // Start refresh if not already in progress
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          // Important: use refreshClient to avoid the same response interceptor
          const { data } = await refreshClient.post("/api/auth/refresh");
          const newToken = data?.token;

          if (!newToken) throw new Error("No token in refresh response");

          setAuthToken(newToken);
          isRefreshing = false;
          resolveQueue(newToken);
        } catch (e) {
          isRefreshing = false;
          rejectQueue(e);

          // Hard logout fallback
          clearAuth();
          if (location.pathname !== "/login") {
            location.href = "/login?reason=expired";
          }
          return Promise.reject(error);
        }
      }

      // Queue this request until refresh finishes
      try {
        const newToken = await new Promise((resolve, reject) => {
          waitQueue.push({ resolve, reject });
        });

        // Retry original with the fresh token
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        // If refresh failed, bubble the original error
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
