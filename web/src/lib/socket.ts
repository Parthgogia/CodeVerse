import { io, type Socket } from 'socket.io-client';
import { authStorage }      from './auth';

let socket: Socket | null = null;

function createSocket(): Socket {
  return io(import.meta.env.VITE_WS_URL ?? 'http://localhost:4000', {
    auth:                 { token: authStorage.getToken() },
    transports:           ['websocket'],
    autoConnect:          false,
    reconnection:         true,
    reconnectionDelay:    1000,
    reconnectionAttempts: 10,
  });
}

export function getSocket(): Socket {
  if (!socket) socket = createSocket();
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

// Called on logout / room exit — forces a fresh token on next connect
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function offSocket(
  events: { event: string; handler: (...args: any[]) => void }[]
): void {
  if (!socket) return;
  for (const { event, handler } of events) {
    socket.off(event, handler);
  }
}

// ── Typed event constants ─────────────────────────────────
// Names match server handlers exactly.
export const SocketEvents = {
  // Client → Server
  JOIN_ROOM:     'room:join',
  LEAVE_ROOM:    'room:leave',
  CODE_CHANGE:   'code:change',    // plain-text fallback
  CURSOR_MOVE:   'cursor:move',    // plain cursor fallback
  YJS_UPDATE:    'yjs:update',     // binary Yjs diff (primary)
  YJS_AWARENESS: 'yjs:awareness',  // cursor + selection awareness

  // Server → Client
  ROOM_STATE:    'room:state',
  USER_JOINED:   'room:user-joined',
  USER_LEFT:     'room:user-left',
  CODE_UPDATE:   'code:update',
  CURSOR_UPDATE: 'cursor:update',
  RUN_RESULT:    'code:run-result',
  ERROR:         'error',
} as const;