import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "../../api/auth";
import { AuthContext, type AuthState } from "./authContextValue";

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

  const register = useCallback(async (username: string, password: string, inviteCode: string) => {
    const user = await apiRegister(username, password, inviteCode);
    setState({ status: "authenticated", user });
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "anonymous" });
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
