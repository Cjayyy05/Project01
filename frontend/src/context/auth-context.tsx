"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, authApi, type AuthUser } from "@/lib/api";

const TOKEN_STORAGE_KEY = "deployflow.access-token";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  retry: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setError(null);
    setStatus("unauthenticated");
  }, []);

  const restoreSession = useCallback(
    async (signal?: AbortSignal) => {
      const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

      if (storedToken === null) {
        setStatus("unauthenticated");
        return;
      }

      setStatus("loading");
      setError(null);

      try {
        const authenticatedUser = await authApi.me(storedToken, signal);
        setToken(storedToken);
        setUser(authenticatedUser);
        setStatus("authenticated");
      } catch (requestError: unknown) {
        if (signal?.aborted === true) return;

        if (requestError instanceof ApiError && requestError.status === 401) {
          clearSession();
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to restore your session.",
        );
        setStatus("error");
      }
    },
    [clearSession],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void restoreSession(controller.signal);
    });
    return () => controller.abort();
  }, [restoreSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    setError(null);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (email: string, password: string) => {
      await authApi.register(email, password);
      await login(email, password);
    },
    [login],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      error,
      login,
      register,
      logout: clearSession,
      retry: restoreSession,
    }),
    [clearSession, error, login, register, restoreSession, status, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
