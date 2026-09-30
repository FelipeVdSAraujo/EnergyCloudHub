import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TermsModal from "../components/TermsModal";

function validUsername(u) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}
function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
// function strongPassword(p) {
//   // min 8, uppercase, number, special
//   return /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(p);
// }

export default function Register() {
  const { register } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [terms, setTerms] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setMsg("");

    if (!validUsername(username)) return setMsg("Username must be 3-20 chars, alphanumeric + underscore.");
    if (!validEmail(email)) return setMsg("Please enter a valid email.");
    //if (!strongPassword(pw)) return setMsg("Password must be 8+ chars, 1 uppercase, 1 number, 1 special char.");
    if (pw !== pw2) return setMsg("Passwords do not match.");
    if (!terms) return setMsg("You must accept the terms.");

    setBusy(true);
    try {
      const res = await register(username, email, pw, pw2);
      setOk(true);
      setMsg(res.message || "Check your email to verify.");
    } catch (err) {
      setOk(false);
      setMsg(err?.response?.data?.message || err?.message || "Registration failed");
    }
     finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Register</h2>
      {msg && <div style={{ color: ok ? "green" : "crimson", marginBottom: 12 }}>{msg}</div>}

      {!ok && (
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Confirm Password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I accept the{" "}
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="underline hover:text-blue-600 focus:outline-none"
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              >
                terms
              </button>
            </label>
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
            {busy ? "Registering..." : "Register"}
          </button>
        </form>
      )}

      <p style={{ marginTop: 12 }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>

      <TermsModal isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
