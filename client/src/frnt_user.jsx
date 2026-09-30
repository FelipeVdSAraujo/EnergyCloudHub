import React, { useEffect, useMemo, useState } from "react";
import { getCurrentUser, requestAccountDeletion } from "./api";

export default function UserPage() {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((res) => {
        if (cancelled) return;

        const data = res.data.configs;
        setUser(res.data.user);
        setFiles(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        if (cancelled) return;
        setError("Not authenticated");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      // Call backend (optional, but good practice)
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Remove token from storage
      localStorage.removeItem("token"); 
      // or sessionStorage.removeItem("token");

      // Redirect to login page
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleDeleteRequest = async () => {
    if (deleteBusy) return;

    const confirmed = window.confirm(
      "Send an account deletion confirmation email to your registered address?"
    );

    if (!confirmed) return;

    setDeleteBusy(true);
    setDeleteMsg("");

    try {
      const res = await requestAccountDeletion();
      setDeleteMsg(res.data?.message || "Check your email to confirm account deletion.");
    } catch (err) {
      setDeleteMsg(err?.response?.data?.message || err?.message || "Unable to start account deletion.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;

    return files.filter((f) => {
      const filename = (f.filename || "").toLowerCase();
      const model = (f.model || "").toLowerCase();
      return filename.includes(q) || model.includes(q);
    });
  }, [files, query]);

  if (error) {
    return <div style={{ textAlign: "center", marginTop: 40 }}>{error}</div>;
  }

  if (!user) {
    return <div style={{ textAlign: "center", marginTop: 40 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>User</h2>
        <button
          onClick={handleLogout}
          style={{
            padding: "6px 12px",
            background: "#d9534f",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Logout
        </button>
      </div>

      <div>
        <strong>Name:</strong> {user.username}
      </div>
      <div>
        <strong>Email:</strong> {user.email}
      </div>

      <div style={{ marginTop: 20, padding: 16, border: "1px solid #fecaca", borderRadius: 8, background: "#fff5f5" }}>
        <h3 style={{ marginTop: 0, color: "#991b1b" }}>Delete account</h3>
        <p style={{ marginTop: 0 }}>
          You must be logged in to start deletion. We will send a confirmation link to your email before anything is removed.
        </p>
        {deleteMsg && (
          <div style={{ color: deleteMsg.toLowerCase().includes("unable") ? "crimson" : "green", marginBottom: 12 }}>
            {deleteMsg}
          </div>
        )}
        <button
          onClick={handleDeleteRequest}
          disabled={deleteBusy}
          style={{
            padding: "10px 16px",
            background: deleteBusy ? "#fca5a5" : "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: deleteBusy ? "not-allowed" : "pointer"
          }}
        >
          {deleteBusy ? "Sending email..." : "Delete my account"}
        </button>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h3>Config files</h3>

      <input
        type="text"
        placeholder="Search by filename or model"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 12 }}
      />

      {filteredFiles.length === 0 ? (
        <div>No configs found.</div>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {filteredFiles.map((file) => (
            <li key={file._id ?? file.id ?? file.filename}>
              <div><strong>{file.filename}</strong></div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Model: {file.model || "-"} · Type: {file.mimeType || "-"} · Size:{" "}
                {typeof file.size === "number" ? `${file.size} bytes` : "-"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
