import type { Socket } from "socket.io";
import { RoomManager }            from "../realtime/roomManager.js";
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
  const userId: string = socket.data.userId as string;

  // ── yjs:awareness ─────────────────────────────────────
  socket.on(
    "yjs:awareness",
    async ({ roomId, state }: { roomId: string; state: AwarenessState }) => {
      // ✅ username may still be undefined if this fires before attachUserData
      await socket.data.ready;
      const username: string = socket.data.username as string;

      if (!RoomManager.isInRoom(socket.id, roomId)) return;

      const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
      if (!ok) return;

      socket.to(roomId).emit("yjs:awareness", {
        ...state,
        userId,
        username,
      });
    },
  );

  // ── cursor:move ───────────────────────────────────────
  socket.on(
    "cursor:move",
    async ({ roomId, position }: { roomId: string; position: CursorPosition }) => {
      // ✅ Same guard
      await socket.data.ready;
      const username: string = socket.data.username as string;

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