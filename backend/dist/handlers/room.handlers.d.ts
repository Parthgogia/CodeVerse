import type { Server, Socket } from "socket.io";
export declare function serializeRoomOp(socket: Socket, op: () => Promise<void>): Promise<void>;
/**
 * Remove a socket from a room and tell the room about it.
 *
 * Announces "user-left" only when the socket really was in that room AND the
 * person has no other socket still there — so a stray leave (React re-mount,
 * a second tab closing) can no longer make everyone think someone walked out.
 */
export declare function handleLeave(io: Server, socket: Socket, userId: string, username: string, roomId: string, leaveSocketRoom: boolean): Promise<void>;
export declare function registerRoomHandlers(io: Server, socket: Socket): void;
export { handleLeave as default };
//# sourceMappingURL=room.handlers.d.ts.map