import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { resetPassword } from "../api";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const res = await resetPassword(token, password, confirmPassword);
      setOk(true);
      setMessage(res.data?.message || "Password updated successfully.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setOk(false);
      setMessage(err?.response?.data?.message || err?.message || "Unable to reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Create a new password</h2>
      {message && <div style={{ color: ok ? "green" : "crimson", marginBottom: 12 }}>{message}</div>}
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <button
          disabled={busy}
          type="submit"
          style={{
            marginTop: 8,
            padding: "10px 24px",
            background: busy ? "#9ca3af" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Updating..." : "Update password"}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        Back to <Link to="/login">login</Link>
      </p>
    </div>
  );
}