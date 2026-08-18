import { RoomManager } from "../realtime/roomManager.js";
import { checkRateLimit, Limits } from "../realtime/rateLimiter.js";
export function registerCursorHandlers(_io, socket) {
    const userId = socket.data.userId;
    // ── yjs:awareness ─────────────────────────────────────
    socket.on("yjs:awareness", async ({ roomId, state }) => {
        // ✅ username may still be undefined if this fires before attachUserData
        await socket.data.ready;
        const username = socket.data.username;
        if (!RoomManager.isInRoom(socket.id, roomId))
            return;
        const ok = await checkRateLimit(userId, "cursor:move", Limits.CURSOR_MOVE);
        if (!ok)
            return;
        socket.to(roomId).emit("yjs:awareness", {
            ...state,
            userId,
            username,
        });
    });
    // ── cursor:move ───────────────────────────────────────
    socket.on("cursor:move", async ({ roomId, position }) => {
        // ✅ Same guard
        await socket.data.ready;
        const username = socket.data.username;
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