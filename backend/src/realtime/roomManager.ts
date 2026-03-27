// ─────────────────────────────────────────────────────────────────────────────
// RoomManager — pure in-memory presence state.
// No DB here; DB ops (snapshots, etc.) happen in the handlers.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomUser {
  socketId: string;
  userId:   string;
  username: string;
  color:    string;
  joinedAt: number;
}

// Deterministic color from userId so the same user always gets the same color
const PALETTE = [
  "#5b4ef0", "#10b981", "#f59e0b", "#f43f5e",
  "#8b5cf6", "#22d3ee", "#ec4899", "#f97316",
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash + userId.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// roomId → Map<socketId, RoomUser>
const rooms = new Map<string, Map<string, RoomUser>>();

// socketId → roomId  (so we can look up room on disconnect)
const socketRoom = new Map<string, string>();

export const RoomManager = {
  // ── Join ──────────────────────────────────────────────────
  join(roomId: string, user: Omit<RoomUser, "color" | "joinedAt">): RoomUser {
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const room    = rooms.get(roomId)!;
    const full: RoomUser = { ...user, color: colorForUser(user.userId), joinedAt: Date.now() };
    room.set(user.socketId, full);
    socketRoom.set(user.socketId, roomId);
    return full;
  },

  // ── Leave ─────────────────────────────────────────────────
  // Returns the user who left (or null) and whether the room is now empty
  leave(socketId: string): { user: RoomUser | null; roomId: string | null; isEmpty: boolean } {
    const roomId = socketRoom.get(socketId) ?? null;
    if (!roomId) return { user: null, roomId: null, isEmpty: false };

    socketRoom.delete(socketId);
    const room = rooms.get(roomId);
    if (!room) return { user: null, roomId, isEmpty: true };

    const user = room.get(socketId) ?? null;
    room.delete(socketId);

    const isEmpty = room.size === 0;
    if (isEmpty) rooms.delete(roomId);
    return { user, roomId, isEmpty };
  },

  // ── Queries ───────────────────────────────────────────────
  getUsers(roomId: string): RoomUser[] {
    return Array.from(rooms.get(roomId)?.values() ?? []);
  },

  getUserCount(roomId: string): number {
    return rooms.get(roomId)?.size ?? 0;
  },

  getRoomForSocket(socketId: string): string | null {
    return socketRoom.get(socketId) ?? null;
  },

  isInRoom(socketId: string, roomId: string): boolean {
    return rooms.get(roomId)?.has(socketId) ?? false;
  },

  // ── Debug ─────────────────────────────────────────────────
  stats(): { rooms: number; sockets: number } {
    return { rooms: rooms.size, sockets: socketRoom.size };
  },
};