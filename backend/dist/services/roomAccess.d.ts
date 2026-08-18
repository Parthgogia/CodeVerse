export interface RoomRecord {
    id: string;
    name: string;
    description: string | null;
    language: string;
    isPublic: boolean;
    ownerId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export type RoomAccess = {
    ok: true;
    room: RoomRecord;
    isOwner: boolean;
} | {
    ok: false;
    status: 403 | 404;
    message: string;
};
export declare const ROOM_NOT_FOUND = "Room not found";
export declare const ROOM_PRIVATE = "This room is private";
/** Authorize by room id — looks the room up, then applies the rules above. */
export declare function resolveRoomAccess(roomId: string | undefined, userId: string | undefined): Promise<RoomAccess>;
/** Authorize a room we already loaded — avoids a second query. */
export declare function authorizeRoom(room: RoomRecord, userId: string | undefined): RoomAccess;
//# sourceMappingURL=roomAccess.d.ts.map