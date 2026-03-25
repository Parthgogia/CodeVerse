import { io, type Socket } from 'socket.io-client';
import { authStorage } from './auth';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:3000', {
      auth: { token: authStorage.getToken() },
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null; // reset so a fresh token is used next time
}

// ── Typed event helpers ───────────────────────────────────
export const SocketEvents = {
  // Client → Server
  JOIN_ROOM:     'room:join',
  LEAVE_ROOM:    'room:leave',
  CODE_CHANGE:   'code:change',
  CURSOR_MOVE:   'cursor:move',
  RUN_CODE:      'code:run',

  // Server → Client
  USER_JOINED:   'room:user-joined',
  USER_LEFT:     'room:user-left',
  CODE_UPDATE:   'code:update',
  CURSOR_UPDATE: 'cursor:update',
  RUN_RESULT:    'code:run-result',
  ROOM_STATE:    'room:state',
  ERROR:         'error',
} as const;