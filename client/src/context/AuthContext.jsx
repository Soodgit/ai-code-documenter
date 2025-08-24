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

  // FIXED: Proper logout function with API call
  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Call logout API to clear refresh token cookie
      await api.post("/api/auth/logout");
      console.log("Logout API call successful");
    } catch (error) {
      // Log error but don't block logout
      console.error("Logout API error:", error?.response?.data?.message || error.message);
    }

    // Clear frontend state regardless of API call success
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
    setTokenHeader(null);
    setIsLoading(false);

    // Redirect to login page
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }, []);

  // Enhanced error clearing
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Token refresh function (optional - for future use)
  const refreshToken = useCallback(async () => {
    try {
      const { data } = await api.post("/api/auth/refresh");
      localStorage.setItem("token", data.token);
      setToken(data.token);
      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      logout(); // Force logout if refresh fails
      return false;
    }
  }, [logout]);

  // Check if user is authenticated (optional - better validation)
  const isAuthenticated = useMemo(() => {
    return Boolean(token && user);
  }, [token, user]);

  // Memoizing the AuthContext value
  const value = useMemo(() => ({
    user,
    token,
    isAuthed: isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    clearError,
    refreshToken,
    setUser, // If you decide to implement a /me refresh endpoint in the future
  }), [user, token, isAuthenticated, isLoading, error, login, logout, clearError, refreshToken]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// Hook to access authentication context values
export function useAuth() {
  const context = useContext(AuthCtx);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}