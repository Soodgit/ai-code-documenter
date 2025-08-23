// src/lib/api.js
import axios from "axios";

/**
 * Resolve the base URL for API requests.
 *
 * If `VITE_API_URL` is undefined (e.g. when running via `npm run dev`),
 * default to the backend on `http://localhost:5000` so that relative
 * `/api/*` paths do not point at the Vite dev server.
 */
const BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:5000";

// Create a single Axios instance for all app requests.
// Using BASE_URL here ensures the client talks to your Express backend by default.
const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// Separate client for token refreshes to prevent interceptor recursion.
const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

/* Helper functions to manage auth tokens */
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

/* Attach token to every outgoing request if present */
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

/* 401 Refresh Token logic with single-flight and queued requests */
let isRefreshing = false;
let waitQueue = [];

function resolveQueue(newToken) {
  waitQueue.forEach(({ resolve }) => resolve(newToken));
  waitQueue = [];
}
function rejectQueue(error) {
  waitQueue.forEach(({ reject }) => reject(error));
  waitQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;

    // Ignore if no config or already retried
    if (!original || original._retry) {
      return Promise.reject(error);
    }

    // Automatically refresh once on 401 Unauthorized
    if (status === 401) {
      original._retry = true;

      // Start refresh if not already in progress
      if (!isRefreshing) {
        isRefreshing = true;
        try {
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

      // Queue the original request until refresh is done
      try {
        const newToken = await new Promise((resolve, reject) => {
          waitQueue.push({ resolve, reject });
        });
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
