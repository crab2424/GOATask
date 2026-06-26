import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchMe, login as apiLogin, logout as apiLogout, type AuthUser } from "../api/auth";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    fetchMe()
      .then((user) => {
        setState(user ? { status: "authenticated", user } : { status: "anonymous" });
      })
      .catch(() => setState({ status: "anonymous" }));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await apiLogin(username, password);
    setState({ status: "authenticated", user });
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "anonymous" });
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
