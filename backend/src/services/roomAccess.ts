import { prisma } from "../config/db.js";

// ─────────────────────────────────────────────────────────────────────────────
// Room authorization — the single source of truth for "may this user open
// this room?". Used by the REST controllers AND the Socket.IO join handler so
// the two can never drift apart.
//
// Rules (they match the wording in the create-room modal):
//   • Public room  → "Anyone with link"  → any authenticated user may enter.
//   • Private room → "Only you"          → only the owner may enter.
//   • Orphaned room (owner deleted, ownerId = null) stays reachable only if
//     it is public — otherwise nobody can ever open it again.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomRecord {
  id:          string;
  name:        string;
  description: string | null;
  language:    string;
  isPublic:    boolean;
  ownerId:     string | null;
  createdAt:   Date;
  updatedAt:   Date;
}

export type RoomAccess =
  | { ok: true;  room: RoomRecord; isOwner: boolean }
  | { ok: false; status: 403 | 404; message: string };

export const ROOM_NOT_FOUND = "Room not found";
export const ROOM_PRIVATE   = "This room is private";

/** Authorize by room id — looks the room up, then applies the rules above. */
export async function resolveRoomAccess(
  roomId: string | undefined,
  userId: string | undefined,
): Promise<RoomAccess> {
  if (!roomId) return { ok: false, status: 404, message: ROOM_NOT_FOUND };

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, status: 404, message: ROOM_NOT_FOUND };

  return authorizeRoom(room, userId);
}

/** Authorize a room we already loaded — avoids a second query. */
export function authorizeRoom(room: RoomRecord, userId: string | undefined): RoomAccess {
  const isOwner = !!userId && room.ownerId === userId;

  if (room.isPublic || isOwner) return { ok: true, room, isOwner };

  // Deliberately 403 (not a 404 cloak): the room id is the share code, so the
  // caller already proved they know it. Hiding existence buys nothing here and
  // "this room is private" is the far more useful message.
  return { ok: false, status: 403, message: ROOM_PRIVATE };
}
