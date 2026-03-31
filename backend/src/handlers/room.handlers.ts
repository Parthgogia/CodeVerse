import type { Server, Socket } from "socket.io";
import { RoomManager }           from "../realtime/roomManager.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
import { prisma }                from "../config/db.js";

// ── Helpers ───────────────────────────────────────────────
async function getLatestCode(roomId: string): Promise<string> {
  const snap = await prisma.snapshot.findFirst({
    where:   { roomId },
    orderBy: { createdAt: "desc" },
  });
  return snap?.content ?? "";
}

export async function handleLeave(
  io:              Server,
  socket:          Socket,
  userId:          string,
  username:        string,
  roomId:          string,
  leaveSocketRoom: boolean,
): Promise<void> {
  // Idempotent — safe even if already removed (e.g. called from disconnect handler)
  RoomManager.leave(socket.id);

  if (leaveSocketRoom) socket.leave(roomId);

  io.to(roomId).emit("room:user-left", { userId, username });

  console.log(
    `[room] ${username} left ${roomId} — ${RoomManager.getUserCount(roomId)} remaining`,
  );
}

// ── Register handlers for one socket connection ───────────
export function registerRoomHandlers(io: Server, socket: Socket): void {
  const userId: string = socket.data.userId as string;

  // ── room:join ─────────────────────────────────────────
  socket.on("room:join", async ({ roomId }: { roomId: string }) => {
    // ✅ Wait for attachUserData to finish — username is not set until it resolves
    await socket.data.ready;
    const username: string = socket.data.username as string;

    console.log(`[DEBUG] room:join received — userId: ${userId}, roomId: ${roomId}`);
    if (!roomId) { socket.emit("error", "roomId is required"); return; }

    const ok = await checkRateLimit(userId, "room:join", Limits.JOIN_ROOM);
    if (!ok) { socket.emit("error", "Too many room joins — slow down."); return; }

    // Verify room exists in DB
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) { socket.emit("error", "Room not found."); return; }

    // If already in a different room, leave gracefully first
    const currentRoom = RoomManager.getRoomForSocket(socket.id);
    if (currentRoom && currentRoom !== roomId) {
      await handleLeave(io, socket, userId, username, currentRoom, true);
    }

    // Register in presence map
    const user = RoomManager.join(roomId, { socketId: socket.id, userId, username });

    // Join Socket.IO channel
    socket.join(roomId);

    // Send current code + online users to the joiner
    const code        = await getLatestCode(roomId);
    const onlineUsers = RoomManager.getUsers(roomId)
      .filter((u) => u.socketId !== socket.id)
      .map((u) => ({ id: u.userId, userId: u.userId, username: u.username, color: u.color }));

    socket.emit("room:state", { code, users: onlineUsers });

    // Announce to everyone else
    socket.to(roomId).emit("room:user-joined", {
      id:       user.userId,
      userId:   user.userId,
      username: user.username,
      color:    user.color,
    });

    console.log(`[room] ${username} joined ${roomId} — ${RoomManager.getUserCount(roomId)} online`);
  });

  // ── room:leave ─────────────────────────────────────────
  socket.on("room:leave", async ({ roomId }: { roomId: string }) => {
    // ✅ Same guard — username must be available before leave logic
    await socket.data.ready;
    const username: string = socket.data.username as string;
    await handleLeave(io, socket, userId, username, roomId, true);
  });

  // ── ping / keep-alive ──────────────────────────────────
  socket.on("ping", (cb) => { if (typeof cb === "function") cb(); });
}