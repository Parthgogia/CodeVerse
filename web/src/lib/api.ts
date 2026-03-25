import type { AuthResponse, Room, CreateRoomInput, RunJob } from '../types/index';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function getToken(): string | null {
  return localStorage.getItem('codeverse_token');
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    req<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (username: string, email: string, password: string) =>
    req<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  me: () => req<AuthResponse['user']>('/api/auth/me'),
};

// ── Rooms ─────────────────────────────────────────────────
export const roomsApi = {
  list: () => req<Room[]>('/api/rooms'),

  get: (id: string) => req<Room>(`/api/rooms/${id}`),

  create: (data: CreateRoomInput) =>
    req<Room>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateRoomInput>) =>
    req<Room>(`/api/rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    req<void>(`/api/rooms/${id}`, { method: 'DELETE' }),
};

// ── Code Execution ────────────────────────────────────────
export const execApi = {
  run: (roomId: string, code: string, language: string) =>
    req<{ jobId: string }>('/api/execute', {
      method: 'POST',
      body: JSON.stringify({ roomId, code, language }),
    }),

  poll: (jobId: string) => req<RunJob>(`/api/execute/${jobId}`),
};