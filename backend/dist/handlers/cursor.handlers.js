import { RoomManager } from "../realtime/roomManager.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
export function registerCursorHandlers(io, socket) {
    const userId = socket.data.userId;
    const username = socket.data.username;
    // ── yjs:awareness ─────────────────────────────────────
    // Cursor position + selection awareness (from useYjsEditor hook)
    socket.on("yjs:awareness", async ({ roomId, state }) => {
        if (!RoomManager.isInRoom(socket.id, roomId))
            return;
        const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
        if (!ok)
            return; // silently drop cursor events when rate-limited
        // Forward to everyone else in the room
        socket.to(roomId).emit("yjs:awareness", {
            ...state,
            userId, // always trust server-side userId
            username, // always trust server-side username
        });
    });
    // ── cursor:move ───────────────────────────────────────
    // Legacy / simple cursor move event (non-Yjs fallback)
    socket.on("cursor:move", async ({ roomId, position }) => {
        if (!RoomManager.isInRoom(socket.id, roomId))
            return;
        const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
        if (!ok)
            return;
        socket.to(roomId).emit("cursor:update", {
            userId,
            username,
            position,
        });
    });
}
//# sourceMappingURL=cursor.handlers.js.map