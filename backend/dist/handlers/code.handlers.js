import { RoomManager } from "../realtime/roomManager.js";
import { RoomDocs } from "../realtime/roomDocs.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
export function registerCodeHandlers(io, socket) {
    const userId = socket.data.userId;
    // ── yjs:update ────────────────────────────────────────
    // Binary Yjs state update — relay to everyone else in the room
    socket.on("yjs:update", async ({ roomId, update }) => {
        if (!RoomManager.isInRoom(socket.id, roomId))
            return;
        const ok = await checkRateLimit(userId, "yjs:update", Limits.YJS_UPDATE);
        if (!ok) {
            socket.emit("error", "Code sync rate limit exceeded. Please slow down.");
            return;
        }
        // Relay raw Yjs binary update to every other client in the room
        socket.to(roomId).emit("yjs:update", { update });
        // …and fold it into the server's own copy of the document. This is what
        // actually makes a room persist: the relay alone left the server with no
        // idea what the code was, so nothing could ever be written to Postgres.
        void RoomDocs.applyUpdate(roomId, new Uint8Array(update));
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