import { prisma } from "../config/db.js";
export const ROOM_NOT_FOUND = "Room not found";
export const ROOM_PRIVATE = "This room is private";
/** Authorize by room id — looks the room up, then applies the rules above. */
export async function resolveRoomAccess(roomId, userId) {
    if (!roomId)
        return { ok: false, status: 404, message: ROOM_NOT_FOUND };
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room)
        return { ok: false, status: 404, message: ROOM_NOT_FOUND };
    return authorizeRoom(room, userId);
}
/** Authorize a room we already loaded — avoids a second query. */
export function authorizeRoom(room, userId) {
    const isOwner = !!userId && room.ownerId === userId;
    if (room.isPublic || isOwner)
        return { ok: true, room, isOwner };
    // Deliberately 403 (not a 404 cloak): the room id is the share code, so the
    // caller already proved they know it. Hiding existence buys nothing here and
    // "this room is private" is the far more useful message.
    return { ok: false, status: 403, message: ROOM_PRIVATE };
}
//# sourceMappingURL=roomAccess.js.map