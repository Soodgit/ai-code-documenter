import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import api from "../lib/api";

// Auth context
const AuthCtx = createContext(null);

// Attach/remove Authorization header on axios
function setTokenHeader(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // keep axios header in sync
  useEffect(() => {
    setTokenHeader(token);
  }, [token]);

  // 🔹 LOGIN (identifier = email OR username)
  const login = useCallback(async (identifier, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/api/auth/login", {
        identifier,
        password,
      });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 🔹 LOGOUT
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await api.post("/api/auth/logout"); // backend clears refresh token cookie
    } catch (err) {
      console.error("Logout API failed:", err?.response?.data?.message || err.message);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setTokenHeader(null);
    setIsLoading(false);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }, []);

  // 🔹 CLEAR ERROR
  const clearError = useCallback(() => setError(null), []);

  // 🔹 REFRESH TOKEN
  const refreshToken = useCallback(async () => {
    try {
      const { data } = await api.post("/api/auth/refresh");
      localStorage.setItem("token", data.token);
      setToken(data.token);
      return true;
    } catch (err) {
      console.error("Token refresh failed:", err);
      logout();
      return false;
    }
  }, [logout]);

  // is user authenticated?
  const isAuthed = useMemo(() => Boolean(token && user), [token, user]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthed,
      isLoading,
      error,
      login,
      logout,
      clearError,
      refreshToken,
      setUser,
    }),
    [user, token, isAuthed, isLoading, error, login, logout, clearError, refreshToken]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
