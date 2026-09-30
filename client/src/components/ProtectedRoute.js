import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { token, user, loadingMe } = useAuth();
  const location = useLocation();

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  if (loadingMe) return <div style={{ padding: 20 }}>Loading...</div>;
  if (user?.role === "pending") return <Navigate to="/pending-approval" replace />;

  return <Outlet />;
}
