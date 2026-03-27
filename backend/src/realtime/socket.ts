import { Server, type Socket }      from "socket.io";
import type { Server as HttpServer } from "http";
import jwt                           from "jsonwebtoken";

import { registerRoomHandlers, handleLeave } from "../handlers/room.handlers.js";
import { registerCodeHandlers }              from "../handlers/code.handlers.js";
import { registerCursorHandlers }            from "../handlers/cursor.handlers.js";
import { RoomManager}            from "./roomManager.js";
import { prisma } from "../config/db.js";


interface TokenPayload { userId: string; }

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
    maxHttpBufferSize: 5 * 1024 * 1024, // 5 MB — for Yjs binary payloads
  });

  io.use(socketAuthMiddleware);

  io.on("connection", async (socket: Socket) => {
    const ok = await attachUserData(socket);
    if (!ok) {
      socket.emit("error", "User not found");
      socket.disconnect(true);
      return;
    }

    const userId:   string = socket.data.userId;
    const username: string = socket.data.username;

    console.log(`[socket] +CONNECT  ${username} (${userId}) [${socket.id}]`);

    // Register domain handlers
    registerRoomHandlers(io, socket);
    registerCodeHandlers(io, socket);
    registerCursorHandlers(io, socket);

    // ── Disconnect — single authoritative cleanup ─────────
    socket.on("disconnect", async (reason) => {
      console.log(`[socket] -DISCONNECT ${username} (${userId}) — ${reason}`);

      // Look up which room this socket was in BEFORE removing from presence map
      const roomId = RoomManager.getRoomForSocket(socket.id);
      if (roomId) {
        // handleLeave removes from RoomManager, emits room:user-left
        await handleLeave(io, socket, userId, username, roomId, false);
      }
    });
  });

  return io;
}