import type { Server, Socket } from "socket.io";
declare function handleLeave(io: Server, socket: Socket, userId: string, username: string, roomId: string, leaveSocketRoom: boolean): Promise<void>;
export declare function registerRoomHandlers(io: Server, socket: Socket): void;
export { handleLeave };
//# sourceMappingURL=room.handlers.d.ts.map