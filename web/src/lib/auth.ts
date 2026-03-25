import type { User } from '../types/index';

const TOKEN_KEY = 'codeverse_token';
const USER_KEY  = 'codeverse_user';

export const authStorage = {
  setToken: (token: string)   => localStorage.setItem(TOKEN_KEY, token),
  getToken: ()                => localStorage.getItem(TOKEN_KEY),
  removeToken: ()             => localStorage.removeItem(TOKEN_KEY),

  setUser:  (user: User)      => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  getUser:  (): User | null   => {
    const raw = localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  removeUser: ()              => localStorage.removeItem(USER_KEY),

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),
};