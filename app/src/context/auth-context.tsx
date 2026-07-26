"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { BASE_URL as BASE } from "@/lib/config";

interface User {
  id: number;
  email: string;
  fullName: string;
  role?: string;
  loginSource?: string;
  planId?: number | null;
  igReelCredits?: number;
  liAnalysisCredits?: number;
  fbAdCredits?: number;
  igCreatorCredits?: number;
  planExpiresAt?: string | null;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User, source: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  showCreditModal: boolean;
  setShowCreditModal: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Shared keys — same user can log in from either platform
const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreditModal, setShowCreditModal] = useState(false);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // invalid storage state
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: User, source: string) => {
    const userWithSource = { ...newUser, loginSource: source };
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userWithSource));
    setToken(newToken);
    setUser(userWithSource);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      // const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
      const res = await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data) {
        setUser((prev) => {
          const updated = { ...prev, ...json.data };
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
          return updated as User;
        });
      }
    } catch (err) {
      console.error("Failed to refresh user data", err);
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        logout,
        refreshUser,
        showCreditModal,
        setShowCreditModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
