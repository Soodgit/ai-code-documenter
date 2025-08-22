import api from "../lib/api";

export async function doLogout() {
  try {
    await api.post("/api/auth/logout");
  } catch (err) {
    console.warn("Logout request failed:", err.message);
  }

  // Clear client storage
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  // Redirect to login
  window.location.href = "/login";
}
