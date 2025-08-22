import { useMemo } from "react";

export function useAuth() {
  const token = localStorage.getItem("token");
  const isAuthed = Boolean(token);
  const user = useMemo(() => (isAuthed ? { name: "User" } : null), [isAuthed]);
  return { isAuthed, user, logout };
}

export function logout() {
  localStorage.removeItem("token");
  window.location.href = "/login";
}
