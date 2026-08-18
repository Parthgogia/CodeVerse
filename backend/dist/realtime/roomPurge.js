import { getIo } from "./ioRegistry.js";
import { RoomManager } from "./roomManager.js";
import { RoomDocs } from "./roomDocs.js";
/** serverSideEmit channel: "this room is gone, drop everything you hold for it". */
export const ROOM_PURGED = "room:purged";
/** Forget a deleted room's local state. Runs on every instance. */
export function purgeRoomLocally(roomId) {
    RoomManager.purgeLocal(roomId);
    RoomDocs.forget(roomId); // deliberately not saved — the row is gone
}
/**
 * Tear a deleted room down across the whole cluster:
 *   • tell anyone sitting in it that it no longer exists,
 *   • empty the Socket.IO room so no further traffic can be addressed to it,
 *   • drop the shared roster, and
 *   • have every instance forget its local presence and cached document.
 *
 * Called after the row is deleted, so it is cleanup rather than a transaction —
 * a partial failure here leaves stale memory, never a half-deleted room.
 */
export async function purgeRoomEverywhere(roomId, roomName) {
    const io = getIo();
    if (io) {
        io.to(roomId).emit("room:deleted", { roomId, name: roomName });
        // Cross-instance with the Redis adapter: nobody is left addressable in it.
        io.in(roomId).socketsLeave(roomId);
        // serverSideEmit reaches the *other* instances only, so also purge here.
        io.serverSideEmit(ROOM_PURGED, roomId);
    }
    purgeRoomLocally(roomId);
    await RoomManager.purgeShared(roomId);
}
//# sourceMappingURL=roomPurge.js.map