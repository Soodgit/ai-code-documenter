import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "../lib/api";

// Creating a context for authentication state
const AuthCtx = createContext(null);

// Function to set the authorization header on API requests
function setTokenHeader(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// AuthProvider component that will wrap the rest of the app
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  });
  
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Syncing token with axios authorization header
  useEffect(() => {
    setTokenHeader(token);
  }, [token]);

  // Memoizing login function to avoid unnecessary re-creations
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);

      return true;
    } catch (e) {
      const errorMessage = e?.response?.data?.message || "Login failed";
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Memoizing logout function for performance
  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);

    // Redirect to login page
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }, []);

  // Memoizing the AuthContext value
  const value = useMemo(() => ({
    user,
    token,
    isAuthed: Boolean(token),
    isLoading,
    error,
    login,
    logout,
    setUser,  // If you decide to implement a /me refresh endpoint in the future
  }), [user, token, isLoading, error, login, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// Hook to access authentication context values
export function useAuth() {
  return useContext(AuthCtx);
}
