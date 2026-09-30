import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`${API_BASE}/auth/verify-email/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setMessage(data.message || "Verification failed");
          return;
        }

        setStatus("success");
        setMessage("Email verified! Redirecting to login...");
        setTimeout(() => navigate("/login"), 1500);
      } catch (err) {
        setStatus("error");
        setMessage("Network error");
      }
    }

    verify();
  }, [token, navigate]);

  return (
    <div style={{ padding: 20 }}>
      {status === "verifying" && <p>Verifying email…</p>}
      {status === "success" && <p>{message}</p>}
      {status === "error" && <p style={{ color: "red" }}>{message}</p>}
    </div>
  );
}
