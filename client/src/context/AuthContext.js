import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect
} from "react";
import { API_BASE } from "../api";

const AuthContext = createContext(null);

function getStoredToken() {
  const t = localStorage.getItem("token");
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem("token");
      return null;
    }
  } catch {}
  return t;
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [loadingMe, setLoadingMe] = useState(Boolean(token));

  const setToken = useCallback((t) => {
    if (t) localStorage.setItem("token", t);
    else localStorage.removeItem("token");
    setTokenState(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoadingMe(false);
      return null;
    }

    setLoadingMe(true);
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setToken(null);
          setUser(null);
          return null;
        }
        throw new Error("Failed to fetch current user");
      }

      const data = await res.json().catch(() => ({}));
      setUser(data?.user || null);
      return data?.user || null;
    } finally {
      setLoadingMe(false);
    }
  }, [token, setToken]);

  useEffect(() => {
    refresh().catch(() => {
      setLoadingMe(false);
    });
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Login failed");

    setToken(data.token);
    setUser(data.user);
    setLoadingMe(false);
    return data.user;
  }, [setToken]);

  const register = useCallback(async (username, email, password, confirmPassword) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, confirmPassword }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Registration failed");

    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoadingMe(false);
  }, [setToken]);

  const value = useMemo(
    () => ({
      token,
      user,
      currentUser: user,
      loadingMe,
      loading: loadingMe,
      refresh,
      login,
      register,
      logout,
    }),
    [token, user, loadingMe, refresh, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
