import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PendingApproval() {
  const { currentUser, refresh } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const t = setInterval(async () => {
      await refresh();
    }, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (currentUser && currentUser.role !== "pending") {
      nav("/");
    }
  }, [currentUser, nav]);

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2>Pending Approval</h2>
      <p>
        Your account is pending admin approval. You will be notified via email once approved.
      </p>
    </div>
  );
}
