import { Server, type Socket }      from "socket.io";
import type { Server as HttpServer } from "http";
import jwt                           from "jsonwebtoken";

import { registerRoomHandlers, handleLeave } from "../handlers/room.handlers.js";
import { registerCodeHandlers }              from "../handlers/code.handlers.js";
import { registerCursorHandlers }            from "../handlers/cursor.handlers.js";
import { RoomManager }                       from "./roomManager.js";
import { prisma }                            from "../config/db.js";

interface TokenPayload { userId: string; }

// Extend SocketData to include the ready promise
declare module "socket.io" {
  interface SocketData {
    userId:   string;
    username: string;
    ready:    Promise<void>;
  }
}

// ── Socket.IO auth middleware ─────────────────────────────
function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("No token provided"));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
}

// ── Hydrate username from DB onto socket.data ─────────────
async function attachUserData(socket: Socket): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: socket.data.userId } });
    if (!user) return false;
    socket.data.username = user.name;
    return true;
  } catch {
    return false;
  }
}

// ── Factory ───────────────────────────────────────────────
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin:      process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    },
    pingTimeout:       20_000,
    pingInterval:      10_000,
    maxHttpBufferSize: 5 * 1024 * 1024,
  });

  io.use(socketAuthMiddleware);

  // ✅ NOT async — handlers registered synchronously so no events are dropped
  io.on("connection", (socket: Socket) => {
    console.log(`[DEBUG] connection received, userId: ${socket.data.userId}`);

    // ✅ Register all handlers synchronously before any await
    registerRoomHandlers(io, socket);
    registerCodeHandlers(io, socket);
    registerCursorHandlers(io, socket);

    // ✅ Store the promise — handlers await this before reading username
    socket.data.ready = attachUserData(socket).then((ok) => {
      console.log(`[DEBUG] attachUserData result: ${ok}`);
      if (!ok) {
        socket.emit("error", "User not found");
        socket.disconnect(true);
        return;
      }
      console.log(`[socket] +CONNECT  ${socket.data.username} (${socket.data.userId}) [${socket.id}]`);
    });

    // ── Disconnect — single authoritative cleanup ─────────
    socket.on("disconnect", async (reason) => {
      // Wait for username to be available before cleanup
      await socket.data.ready;

      const userId   = socket.data.userId   as string;
      const username = socket.data.username as string;

      console.log(`[socket] -DISCONNECT ${username} (${userId}) — ${reason}`);

      const roomId = RoomManager.getRoomForSocket(socket.id);
      if (roomId) {
        await handleLeave(io, socket, userId, username, roomId, false);
      }
    });
  });

  return io;
}