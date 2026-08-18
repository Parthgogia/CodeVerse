/** serverSideEmit channel: "this room is gone, drop everything you hold for it". */
export declare const ROOM_PURGED = "room:purged";
/** Forget a deleted room's local state. Runs on every instance. */
export declare function purgeRoomLocally(roomId: string): void;
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
export declare function purgeRoomEverywhere(roomId: string, roomName?: string): Promise<void>;
//# sourceMappingURL=roomPurge.d.ts.map