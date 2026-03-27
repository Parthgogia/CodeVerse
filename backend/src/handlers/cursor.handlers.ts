import type { Socket } from "socket.io";
import { RoomManager }   from "../realtime/roomManager.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";


interface CursorPosition {
  lineNumber: number;
  column:     number;
}

interface Selection {
  startLineNumber: number;
  startColumn:     number;
  endLineNumber:   number;
  endColumn:       number;
}

interface AwarenessState {
  userId:    string;
  username:  string;
  color:     string;
  cursor:    CursorPosition | null;
  selection: Selection | null;
}

export function registerCursorHandlers(_io: unknown, socket: Socket) {
  const userId:   string = (socket.data as any).userId;
  const username: string = (socket.data as any).username;

  // ── yjs:awareness ─────────────────────────────────────
  // Cursor position + selection awareness (from useYjsEditor hook)
  socket.on(
    "yjs:awareness",
    async ({ roomId, state }: { roomId: string; state: AwarenessState }) => {
      if (!RoomManager.isInRoom(socket.id, roomId)) return;

      const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
      if (!ok) return; // silently drop cursor events when rate-limited

      // Forward to everyone else in the room
      socket.to(roomId).emit("yjs:awareness", {
        ...state,
        userId,   // always trust server-side userId
        username, // always trust server-side username
      });
    },
  );

  // ── cursor:move ───────────────────────────────────────
  // Legacy / simple cursor move event (non-Yjs fallback)
  socket.on(
    "cursor:move",
    async ({ roomId, position }: { roomId: string; position: CursorPosition }) => {
      if (!RoomManager.isInRoom(socket.id, roomId)) return;

      const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
      if (!ok) return;

      socket.to(roomId).emit("cursor:update", {
        userId,
        username,
        position,
      });
    },
  );
}