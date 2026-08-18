import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
declare module "socket.io" {
    interface SocketData {
        userId: string;
        username: string;
        ready: Promise<void>;
        /** Tail of this socket's serialized room-op chain (see room.handlers). */
        roomOps?: Promise<void>;
    }
}
export declare function createSocketServer(httpServer: HttpServer): Server;
/** Drop this instance's presence entries and close its Redis connections. */
export declare function closeSocketServer(io: Server): Promise<void>;
//# sourceMappingURL=socket.d.ts.map