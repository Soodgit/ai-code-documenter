import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const authed = () => !!localStorage.getItem("token");

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!authed()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
