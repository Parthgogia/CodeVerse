import type { Server, Socket }  from "socket.io";
import { RoomManager }           from "../realtime/roomManager.js";
import { RoomDocs }              from "../realtime/roomDocs.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
import { prisma }                from "../config/db.js";
import { resolveRoomAccess }     from "../services/roomAccess.js";

const VALID_LANGUAGES = new Set(['javascript','typescript','python','cpp','java']);

// ── Per-socket serialization ──────────────────────────────
// join/leave both mutate presence and both await Redis + Postgres, so two of
// them in flight at once can finish out of order — which is how a client that
// emitted join→leave→join ended up broadcasting "left" before "joined".
// Chaining them per socket guarantees they are applied in arrival order.
export function serializeRoomOp(socket: Socket, op: () => Promise<void>): Promise<void> {
  const next = (socket.data.roomOps ?? Promise.resolve())
    .then(op)
    .catch((err: any) => console.error("[room] handler error:", err?.message ?? err));
  socket.data.roomOps = next;
  return next;
}

// ── Departure grace period ────────────────────────────────
// A page refresh, a dropped Wi-Fi packet and React re-mounting the editor all
// look identical from here: the socket goes away and an equivalent one appears
// a moment later. Announcing the exit the instant it happens makes everyone
// else watch "X left" / "X joined" for a person who never actually left, so
// hold the announcement briefly and drop it if they come back.
const DEPARTURE_GRACE_MS = 3_000;

const pendingDepartures = new Map<string, ReturnType<typeof setTimeout>>();
const departureKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

function cancelPendingDeparture(roomId: string, userId: string): void {
  const key   = departureKey(roomId, userId);
  const timer = pendingDepartures.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingDepartures.delete(key);
  }
}

function scheduleDeparture(io: Server, roomId: string, userId: string, username: string): void {
  cancelPendingDeparture(roomId, userId);
  const key = departureKey(roomId, userId);

  const timer = setTimeout(async () => {
    pendingDepartures.delete(key);
    try {
      // Re-check the shared roster before announcing: they may have come back
      // on a different instance, which never touched this timer.
      if (await RoomManager.hasUser(roomId, userId)) return;

      io.to(roomId).emit("room:user-left", { userId, username });
      console.log(
        `[room] ${username} left ${roomId} — ${await RoomManager.getUserCount(roomId)} remaining`,
      );
    } catch (err: any) {
      console.error("[room] departure announce failed:", err?.message ?? err);
    }
  }, DEPARTURE_GRACE_MS);

  timer.unref?.();
  pendingDepartures.set(key, timer);
}

/**
 * Once nobody on this instance is left in the room, write the document out and
 * drop it from memory. Other instances keep their own copy for their own users.
 */
async function releaseDocIfIdle(roomId: string): Promise<void> {
  if (RoomManager.localSocketCount(roomId) > 0) return;
  await RoomDocs.release(roomId);
}

/**
 * Remove a socket from a room and tell the room about it.
 *
 * Announces "user-left" only when the socket really was in that room AND the
 * person has no other socket still there — so a stray leave (React re-mount,
 * a second tab closing) can no longer make everyone think someone walked out.
 */
export async function handleLeave(
  io:              Server,
  socket:          Socket,
  userId:          string,
  username:        string,
  roomId:          string,
  leaveSocketRoom: boolean,
): Promise<void> {
  // Never in this room → nothing happened, so say nothing.
  if (!RoomManager.isInRoom(socket.id, roomId)) return;

  const { user } = await RoomManager.leave(socket.id);
  if (!user) return;

  if (leaveSocketRoom) socket.leave(roomId);

  const stillHere = await RoomManager.hasUser(roomId, userId, socket.id);
  if (stillHere) {
    console.log(`[room] ${username} closed one connection to ${roomId} — still present elsewhere`);
    return;
  }

  scheduleDeparture(io, roomId, userId, username);

  await releaseDocIfIdle(roomId);
}

// ── Register handlers for one socket connection ───────────
export function registerRoomHandlers(io: Server, socket: Socket): void {
  const userId: string = socket.data.userId as string;

  // ── room:join ─────────────────────────────────────────
  socket.on("room:join", ({ roomId }: { roomId: string }) => serializeRoomOp(socket, async () => {
    await socket.data.ready;
    const username: string = socket.data.username as string;

    if (!roomId) { socket.emit("error", "roomId is required"); return; }

    // Already in this room — a duplicate join (re-mount, double emit).
    // Re-send the state so the client is never left hanging, but do NOT
    // announce the user again.
    if (RoomManager.isInRoom(socket.id, roomId)) {
      await sendRoomState(socket, roomId, userId);
      return;
    }

    const ok = await checkRateLimit(userId, "room:join", Limits.JOIN_ROOM);
    if (!ok) { socket.emit("error", "Too many room joins — slow down."); return; }

    // Same authorization rules as the REST API: private rooms are owner-only.
    const access = await resolveRoomAccess(roomId, userId);
    if (!access.ok) { socket.emit("error", `${access.message}.`); return; }
    const room = access.room;

    // If already in a different room, leave gracefully first
    const currentRoom = RoomManager.getRoomForSocket(socket.id);
    if (currentRoom && currentRoom !== roomId) {
      await handleLeave(io, socket, userId, username, currentRoom, true);
    }

    const user = await RoomManager.join(roomId, { socketId: socket.id, userId, username });

    // They came back inside the grace window — the room was never told they
    // left, so there is nothing to undo beyond dropping the pending exit.
    cancelPendingDeparture(roomId, userId);

    socket.join(roomId);

    await sendRoomState(socket, roomId, userId, room.language);

    // Announced once per *new socket*, not once per person: peers use this
    // event to push their Yjs document state to the arriving connection, so a
    // user's second tab still needs it. The client suppresses the duplicate
    // toast for someone already in its roster.
    socket.to(roomId).emit("room:user-joined", {
      id:       user.userId,
      userId:   user.userId,
      username: user.username,
      color:    user.color,
    });

    console.log(`[room] ${username} joined ${roomId} — ${await RoomManager.getUserCount(roomId)} online`);
  }));

  // ── room:leave ─────────────────────────────────────────
  socket.on("room:leave", ({ roomId }: { roomId: string }) => serializeRoomOp(socket, async () => {
    await socket.data.ready;
    const username: string = socket.data.username as string;
    await handleLeave(io, socket, userId, username, roomId, true);
  }));

  // ── room:language-change ───────────────────────────────
  socket.on("room:language-change", async ({ roomId, language }: { roomId: string; language: string }) => {
    await socket.data.ready;
    const username: string = socket.data.username as string;

    if (!VALID_LANGUAGES.has(language)) {
      socket.emit("error", "Invalid language.");
      return;
    }

    if (!RoomManager.isInRoom(socket.id, roomId)) return;

    // Persist to DB so new joiners always get the current language
    await prisma.room.update({
      where: { id: roomId },
      data:  { language },
    });

    // ✅ Broadcast to everyone else in the room
    socket.to(roomId).emit("room:language-changed", { language, changedBy: username });

    console.log(`[room] ${username} changed language to ${language} in ${roomId}`);
  });

  // ── ping / keep-alive ──────────────────────────────────
  socket.on("ping", (cb) => { if (typeof cb === "function") cb(); });
}

// ── room:state ────────────────────────────────────────────
// Sent on join (and on a duplicate join). `users` excludes the caller — on
// every socket of theirs — so a second tab never shows you to yourself.
async function sendRoomState(
  socket:   Socket,
  roomId:   string,
  userId:   string,
  language?: string,
): Promise<void> {
  const lang = language ?? (await prisma.room.findUnique({
    where:  { id: roomId },
    select: { language: true },
  }))?.language;

  // `doc` is the room's persisted Yjs state — the client applies it directly, so
  // a returning user gets the document back exactly as they left it. `code` is
  // the same content as plain text, kept for any client that can't use the CRDT.
  const [doc, code, users] = await Promise.all([
    RoomDocs.getState(roomId),
    RoomDocs.getText(roomId),
    RoomManager.getPresence(roomId, userId),
  ]);

  socket.emit("room:state", {
    code,
    doc:      Array.from(doc),
    users,
    language: lang,
  });
}

export { handleLeave as default };
