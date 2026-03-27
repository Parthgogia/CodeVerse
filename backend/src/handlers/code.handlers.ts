import type { Server, Socket } from "socket.io";
import { RoomManager }   from "../realtime/roomManager.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
import { prisma } from "../config/db.js";


// Debounce snapshot saves per room to avoid write storms
const snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSnapshot(roomId: string, content: string, delaySecs = 8) {
  const existing = snapshotTimers.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    snapshotTimers.delete(roomId);
    if (!content.trim()) return;
    try {
      await prisma.snapshot.create({ data: { roomId, content } });
      console.log(`[snapshot] Saved snapshot for room ${roomId} (${content.length} chars)`);
    } catch (err) {
      console.error(`[snapshot] Failed to save for ${roomId}:`, err);
    }
  }, delaySecs * 1000);

  snapshotTimers.set(roomId, timer);
}

export function registerCodeHandlers(io: Server, socket: Socket) {
  const userId: string = (socket.data as any).userId;

  // ── yjs:update ────────────────────────────────────────
  // Binary Yjs state update — relay to everyone else in the room
  socket.on("yjs:update", async ({ roomId, update }: { roomId: string; update: number[] }) => {
    if (!RoomManager.isInRoom(socket.id, roomId)) return;

    const ok = await checkRateLimit(userId, "yjs:update", Limits.YJS_UPDATE);
    if (!ok) {
      socket.emit("error", "Code sync rate limit exceeded. Please slow down.");
      return;
    }

    // Relay raw Yjs binary update to every other client in the room
    socket.to(roomId).emit("yjs:update", { update });
  });

  // ── code:change ───────────────────────────────────────
  // Plain-text fallback (used when Yjs isn't available / initial load)
  socket.on("code:change", async ({ roomId, content }: { roomId: string; content: string }) => {
    if (!RoomManager.isInRoom(socket.id, roomId)) return;

    const ok = await checkRateLimit(userId, "code:change", Limits.CODE_CHANGE);
    if (!ok) {
      socket.emit("error", "Too many code updates. Please slow down.");
      return;
    }

    // Broadcast to all OTHER clients in the room
    socket.to(roomId).emit("code:update", { content, userId });

    // Debounced snapshot write
    scheduleSnapshot(roomId, content);
  });
}