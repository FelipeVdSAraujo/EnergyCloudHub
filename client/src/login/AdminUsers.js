import React, { useEffect, useMemo, useState } from "react";
import { adminListUsers, adminApproveUser, adminRejectUser } from "../api";

export default function AdminUsers() {
  const [roleTab, setRoleTab] = useState("pending");
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectModal, setRejectModal] = useState({ open: false, userId: "", reason: "" });

  async function load() {
    setMsg("");
    const res = await adminListUsers(roleTab);
    setUsers(res.data);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleTab]);

  const counts = useMemo(() => {
    // simple counts per current loaded tab only; optional to fetch all tabs
    return { current: users.length };
  }, [users]);

  async function approve(id) {
    setBusyId(id);
    setMsg("");
    try {
      await adminApproveUser(id);
      await load();
      setMsg("User approved.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Approve failed");
    } finally {
      setBusyId("");
    }
  }

  async function reject(id, reason) {
    setBusyId(id);
    setMsg("");
    try {
      await adminRejectUser(id, reason);
      await load();
      setMsg("User rejected.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Reject failed");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Users</h2>

      <div style={{ marginBottom: 12 }}>
        <button onClick={() => setRoleTab("pending")} disabled={roleTab === "pending"}>
          Pending
        </button>{" "}
        <button onClick={() => setRoleTab("approved")} disabled={roleTab === "approved"}>
          Approved
        </button>{" "}
        <button onClick={() => setRoleTab("rejected")} disabled={roleTab === "rejected"}>
          Rejected
        </button>
        <span style={{ marginLeft: 12, opacity: 0.7 }}>Showing: {counts.current}</span>
      </div>

      {msg && <div style={{ marginBottom: 12, color: "teal" }}>{msg}</div>}

      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Status</th>
            <th>Email Verified</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.emailVerified ? "Yes" : "No"}</td>
              <td>{u.createdAt ? new Date(u.createdAt).toLocaleString() : "-"}</td>
              <td>
                {roleTab === "pending" && (
                  <>
                    <button disabled={busyId === u.id} onClick={() => approve(u.id)}>
                      {busyId === u.id ? "Working..." : "Approve"}
                    </button>{" "}
                    <button
                      disabled={busyId === u.id}
                      onClick={() => setRejectModal({ open: true, userId: u.id, reason: "" })}
                    >
                      Reject
                    </button>
                  </>
                )}
                {roleTab !== "pending" && <span style={{ opacity: 0.6 }}>—</span>}
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan="6" style={{ textAlign: "center", opacity: 0.7 }}>
                No users.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {rejectModal.open && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ccc" }}>
          <h4>Reject User</h4>
          <textarea
            rows="3"
            style={{ width: "100%" }}
            placeholder="Reason (optional)"
            value={rejectModal.reason}
            onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
          />
          <div style={{ marginTop: 8 }}>
            <button
              disabled={busyId === rejectModal.userId}
              onClick={() => reject(rejectModal.userId, rejectModal.reason).then(() => setRejectModal({ open: false, userId: "", reason: "" }))}
            >
              Send Rejection
            </button>{" "}
            <button onClick={() => setRejectModal({ open: false, userId: "", reason: "" })}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
