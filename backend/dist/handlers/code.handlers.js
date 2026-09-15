import { RoomManager } from "../realtime/roomManager.js";
import { RoomDocs } from "../realtime/roomDocs.js";
import { checkRateLimit, rateLimitRetryAfter, Limits } from "../realtime/rateLimiter.js";
/** Binary frames arrive as Buffer; older clients and harnesses still send number[]. */
function toBytes(u) {
    if (Buffer.isBuffer(u))
        return u;
    if (u instanceof ArrayBuffer)
        return Buffer.from(u);
    if (u instanceof Uint8Array)
        return Buffer.from(u);
    if (Array.isArray(u))
        return Buffer.from(u);
    return Buffer.alloc(0);
}
export function registerCodeHandlers(io, socket) {
    const userId = socket.data.userId;
    // ── yjs:update ────────────────────────────────────────
    // Incremental Yjs update (binary) — relay to everyone else in the room. The
    // ack matters: an incremental update that is dropped leaves peers with a
    // permanent gap (later updates depend on it), so the client resends its full
    // state when told an update was rate-limited.
    socket.on("yjs:update", async ({ roomId, update }, ack) => {
        if (!RoomManager.isInRoom(socket.id, roomId)) {
            ack?.({ ok: false, reason: "not-in-room" });
            return;
        }
        const ok = await checkRateLimit(userId, "yjs:update", Limits.YJS_UPDATE);
        if (!ok) {
            socket.emit("error", "Code sync rate limit exceeded. Please slow down.");
            // Tell the client when the window resets so its resync lands after it,
            // rather than being rate-limited again on a blind timer.
            const retryAfterMs = (await rateLimitRetryAfter(userId, "yjs:update", Limits.YJS_UPDATE)) * 1000;
            ack?.({ ok: false, reason: "rate-limited", retryAfterMs });
            return;
        }
        const bytes = toBytes(update);
        if (!bytes.length) {
            ack?.({ ok: false, reason: "empty" });
            return;
        }
        // Relay the bytes untouched to every other client in the room — a Buffer
        // goes out as a binary frame, and the Redis adapter carries it as-is.
        socket.to(roomId).emit("yjs:update", { update: bytes });
        // …and fold it into the server's own copy of the document. This is what
        // actually makes a room persist: the relay alone left the server with no
        // idea what the code was, so nothing could ever be written to Postgres.
        void RoomDocs.applyUpdate(roomId, bytes);
        ack?.({ ok: true });
    });
    // ── code:change ───────────────────────────────────────
    // Plain-text fallback (used when Yjs isn't available / initial load)
    socket.on("code:change", async ({ roomId, content }) => {
        if (!RoomManager.isInRoom(socket.id, roomId))
            return;
        const ok = await checkRateLimit(userId, "code:change", Limits.CODE_CHANGE);
        if (!ok) {
            socket.emit("error", "Too many code updates. Please slow down.");
            return;
        }
        // Broadcast to all OTHER clients in the room
        socket.to(roomId).emit("code:update", { content, userId });
    });
}
//# sourceMappingURL=code.handlers.js.map