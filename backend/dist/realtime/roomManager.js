// ─────────────────────────────────────────────────────────────────────────────
// RoomManager — pure in-memory presence state.
// No DB here; DB ops (snapshots, etc.) happen in the handlers.
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic color from userId so the same user always gets the same color
const PALETTE = [
    "#5b4ef0", "#10b981", "#f59e0b", "#f43f5e",
    "#8b5cf6", "#22d3ee", "#ec4899", "#f97316",
];
function colorForUser(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++)
        hash = (hash + userId.charCodeAt(i)) & 0xffffffff;
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
// roomId → Map<socketId, RoomUser>
const rooms = new Map();
// socketId → roomId  (so we can look up room on disconnect)
const socketRoom = new Map();
export const RoomManager = {
    // ── Join ──────────────────────────────────────────────────
    join(roomId, user) {
        if (!rooms.has(roomId))
            rooms.set(roomId, new Map());
        const room = rooms.get(roomId);
        const full = { ...user, color: colorForUser(user.userId), joinedAt: Date.now() };
        room.set(user.socketId, full);
        socketRoom.set(user.socketId, roomId);
        return full;
    },
    // ── Leave ─────────────────────────────────────────────────
    // Returns the user who left (or null) and whether the room is now empty
    leave(socketId) {
        const roomId = socketRoom.get(socketId) ?? null;
        if (!roomId)
            return { user: null, roomId: null, isEmpty: false };
        socketRoom.delete(socketId);
        const room = rooms.get(roomId);
        if (!room)
            return { user: null, roomId, isEmpty: true };
        const user = room.get(socketId) ?? null;
        room.delete(socketId);
        const isEmpty = room.size === 0;
        if (isEmpty)
            rooms.delete(roomId);
        return { user, roomId, isEmpty };
    },
    // ── Queries ───────────────────────────────────────────────
    getUsers(roomId) {
        return Array.from(rooms.get(roomId)?.values() ?? []);
    },
    getUserCount(roomId) {
        return rooms.get(roomId)?.size ?? 0;
    },
    getRoomForSocket(socketId) {
        return socketRoom.get(socketId) ?? null;
    },
    isInRoom(socketId, roomId) {
        return rooms.get(roomId)?.has(socketId) ?? false;
    },
    // ── Debug ─────────────────────────────────────────────────
    stats() {
        return { rooms: rooms.size, sockets: socketRoom.size };
    },
};
//# sourceMappingURL=roomManager.js.map