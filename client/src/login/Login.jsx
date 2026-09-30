import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const fromState = location.state?.from;
  const redirectTo =
    (typeof fromState === "string" && fromState) ||
    fromState?.pathname ||
    "/";

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setMsg("");
    setBusy(true);
    try {
      const user = await login(username, password);

      if (user.role === "pending") {
        nav("/pending-approval");
      } else {
        nav(redirectTo, { replace: true });
      }
    } catch (err) {
      setMsg(
        err?.response?.data?.message || // axios
        err?.message ||                 // fetch / thrown Error
        "Login failed"
      );

    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Login</h2>
      {msg && <div style={{ color: "crimson", marginBottom: 12 }}>{msg}</div>}
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Username or Email</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
        </div>
        <button
          disabled={busy}
          type="submit"
          style={{
            marginTop: 8,
            padding: "10px 24px",
            background: busy ? "#9ca3af" : "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 16,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Logging in..." : "Login"}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        No account? <Link to="/register" style={{ color: "#2563eb", textDecoration: "underline" }}>Register</Link>
      </p>
      <p style={{ marginTop: 8 }}>
        <Link to="/forgot-password" style={{ color: "#2563eb", textDecoration: "underline" }}>
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
