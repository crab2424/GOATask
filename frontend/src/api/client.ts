export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: "include" });
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
