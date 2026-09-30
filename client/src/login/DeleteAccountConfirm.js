import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { confirmAccountDeletion } from "../api";

export default function DeleteAccountConfirm() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function onConfirm() {
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const res = await confirmAccountDeletion(token);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setOk(true);
      setMessage(res.data?.message || "Account deleted successfully.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setOk(false);
      setMessage(err?.response?.data?.message || err?.message || "Unable to delete account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Confirm account deletion</h2>
      <p>This permanently removes your account after you confirm.</p>
      {message && <div style={{ color: ok ? "green" : "crimson", marginBottom: 12 }}>{message}</div>}
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        style={{
          marginTop: 8,
          padding: "10px 24px",
          background: busy ? "#fca5a5" : "#dc2626",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 16,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Deleting..." : "Confirm deletion"}
      </button>
      <p style={{ marginTop: 12 }}>
        Return to <Link to="/login">login</Link>
      </p>
    </div>
  );
}