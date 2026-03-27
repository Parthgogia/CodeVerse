export interface RoomUser {
    socketId: string;
    userId: string;
    username: string;
    color: string;
    joinedAt: number;
}
export declare const RoomManager: {
    join(roomId: string, user: Omit<RoomUser, "color" | "joinedAt">): RoomUser;
    leave(socketId: string): {
        user: RoomUser | null;
        roomId: string | null;
        isEmpty: boolean;
    };
    getUsers(roomId: string): RoomUser[];
    getUserCount(roomId: string): number;
    getRoomForSocket(socketId: string): string | null;
    isInRoom(socketId: string, roomId: string): boolean;
    stats(): {
        rooms: number;
        sockets: number;
    };
};
//# sourceMappingURL=roomManager.d.ts.map