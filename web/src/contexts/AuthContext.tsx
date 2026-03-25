import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types/index';
import { authApi } from '../lib/api';
import { authStorage } from '../lib/auth';

interface AuthCtx {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(authStorage.getUser());
  const [isLoading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    if (!authStorage.getToken()) { setLoading(false); return; }
    authApi.me()
      .then((u) => { setUser(u); authStorage.setUser(u); })
      .catch(() => { authStorage.clear(); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await authApi.login(email, password);
    authStorage.setToken(token);
    authStorage.setUser(u);
    setUser(u);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const { token, user: u } = await authApi.register(username, email, password);
    authStorage.setToken(token);
    authStorage.setUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    authStorage.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
