import React from "react";
import { useAuth } from "../context/AuthContext";

export default function RequireAdmin({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!currentUser) return <div style={{ padding: 20 }}>Please log in.</div>;
  if (currentUser.role !== "admin") return <div style={{ padding: 20 }}>Access denied.</div>;

  return children;
}
