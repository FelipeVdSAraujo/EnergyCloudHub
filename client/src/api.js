import axios from "axios";

export const API_BASE = process.env.REACT_APP_API_BASE || "/api";

const api = axios.create({
  baseURL: API_BASE,
});

// Request: attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  // Ensure headers object exists
  config.headers = config.headers || {};

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }



  return config;
});

// Response: handle auth failures
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;

    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(err);
  }
);

// API functions
export function login(username, password) {
  return api.post("/auth/login", { username, password });
}

export function register(username, email, password, confirmPassword) {
  return api.post("/auth/register", { username, email, password, confirmPassword });
}

export function verifyEmail(token) {
  return api.get(`/auth/verify-email/${token}`);
}

export function forgotPassword(email) {
  return api.post("/auth/forgot-password", { email });
}

export function resetPassword(token, password, confirmPassword) {
  return api.post(`/auth/reset-password/${token}`, { password, confirmPassword });
}

export function requestAccountDeletion() {
  return api.post("/auth/delete-account/request");
}

export function confirmAccountDeletion(token) {
  return api.post(`/auth/delete-account/${token}`);
}

export function getCurrentUser() {
  return api.get("/auth/me");
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function adminListUsers(role) {
  const qs = role ? `?role=${encodeURIComponent(role)}` : "";
  return api.get(`/admin/users${qs}`);
}

export function adminApproveUser(userId) {
  return api.post(`/admin/users/${userId}/approve`);
}

export function adminRejectUser(userId, reason) {
  return api.post(`/admin/users/${userId}/reject`, { reason });
}

export default api;
