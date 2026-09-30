import React, { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setMessage("");

    try {
      const res = await forgotPassword(email);
      setMessage(res.data?.message || "If that email exists, a reset link has been sent.");
    } catch (err) {
      setMessage(err?.response?.data?.message || err?.message || "Unable to send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Reset password</h2>
      <p>Enter your email and we will send you a password reset link.</p>
      {message && <div style={{ color: message.toLowerCase().includes("unable") ? "crimson" : "green", marginBottom: 12 }}>{message}</div>}
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {busy ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        Back to <Link to="/login">login</Link>
      </p>
    </div>
  );
}