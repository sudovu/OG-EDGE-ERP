import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  const orgId = localStorage.getItem("orgId");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (orgId) config.headers["X-Organization-Id"] = orgId;
  return config;
});

export function setAuth(token: string, orgId?: string) {
  localStorage.setItem("token", token);
  if (orgId) localStorage.setItem("orgId", orgId);
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("orgId");
}