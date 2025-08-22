import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

function setTokenHeader(token) {
  // In case your axios client doesn’t already have an interceptor,
  // set the header here too so we're double-sure.
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // keep axios header in sync with token
  useEffect(() => {
    setTokenHeader(token);
  }, [token]);

  const login = async (email, password) => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (e) {
      const msg = e?.response?.data?.message || "Login failed";
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // if you add a backend /logout later, it's fine to POST there first
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    // redirect so ProtectedRoute kicks in
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthed: Boolean(token),
      isLoading,
      error,
      login,
      logout,
      setUser, // exposed if you later add /me refresh endpoint
    }),
    [user, token, isLoading, error]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
