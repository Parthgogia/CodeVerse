export interface RoomUser {
    socketId: string;
    userId: string;
    username: string;
    color: string;
    joinedAt: number;
    instanceId: string;
}
/** Shape sent to clients — no socketId / instance internals. */
export interface PresenceUser {
    id: string;
    userId: string;
    username: string;
    color: string;
}
export declare const INSTANCE_ID: `${string}-${string}-${string}-${string}-${string}`;
export declare const RoomManager: {
    /** Publish this instance's heartbeat. Call once, before accepting sockets. */
    startHeartbeat(): Promise<void>;
    /** Remove every trace of this instance — called on graceful shutdown. */
    shutdown(): Promise<void>;
    join(roomId: string, user: Omit<RoomUser, "color" | "joinedAt" | "instanceId">): Promise<RoomUser>;
    /** Returns the user who left (or null if this socket was in no room). */
    leave(socketId: string): Promise<{
        user: RoomUser | null;
        roomId: string | null;
    }>;
    /** Every connected socket in the room, across all instances. */
    getUsers(roomId: string): Promise<RoomUser[]>;
    /**
     * One entry per person — a user with two tabs open is still one participant.
     * `excludeUserId` drops the caller so they never see themselves in the roster.
     */
    getPresence(roomId: string, excludeUserId?: string): Promise<PresenceUser[]>;
    /** Distinct people in the room (not socket count). */
    getUserCount(roomId: string): Promise<number>;
    /**
     * Is this user still in the room through any socket, anywhere?
     * `ignoreSocketId` lets a leave handler ask "…apart from the one that just left?".
     */
    hasUser(roomId: string, userId: string, ignoreSocketId?: string): Promise<boolean>;
    isInRoom(socketId: string, roomId: string): boolean;
    getRoomForSocket(socketId: string): string | null;
    /**
     * Connections to THIS instance in the room. Zero means this process has no
     * further reason to keep the room's document in memory.
     */
    localSocketCount(roomId: string): number;
    /** Forget a room's local presence — no announcements; the room is gone. */
    purgeLocal(roomId: string): void;
    /** Remove the shared roster for a deleted room. */
    purgeShared(roomId: string): Promise<void>;
    stats(): {
        instanceId: string;
        rooms: number;
        sockets: number;
    };
};
//# sourceMappingURL=roomManager.d.ts.map