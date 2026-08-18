import { Server, type Socket }      from "socket.io";
import type { Server as HttpServer } from "http";
import jwt                           from "jsonwebtoken";
import { createAdapter }             from "@socket.io/redis-adapter";

import { registerRoomHandlers, handleLeave, serializeRoomOp } from "../handlers/room.handlers.js";
import { registerCodeHandlers }              from "../handlers/code.handlers.js";
import { registerCursorHandlers }            from "../handlers/cursor.handlers.js";
import { RoomManager, INSTANCE_ID }          from "./roomManager.js";
import { setIo }                             from "./ioRegistry.js";
import { ROOM_PURGED, purgeRoomLocally }     from "./roomPurge.js";
import { createRedisClient }                 from "../config/redis.js";
import { prisma }                            from "../config/db.js";

interface TokenPayload { userId: string; }

// Extend SocketData to include the ready promise
declare module "socket.io" {
  interface SocketData {
    userId:   string;
    username: string;
    ready:    Promise<void>;
    /** Tail of this socket's serialized room-op chain (see room.handlers). */
    roomOps?: Promise<void>;
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

// Redis pub/sub pair backing the adapter — kept module-level so shutdown can
// close them. A client in subscriber mode can't issue normal commands, hence
// two dedicated connections rather than reusing the shared singleton.
let pubClient: ReturnType<typeof createRedisClient> | null = null;
let subClient: ReturnType<typeof createRedisClient> | null = null;

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

  // ── Horizontal scaling ──────────────────────────────────
  // Without this, io.to(room).emit() only reaches sockets attached to THIS
  // process — so with two instances behind a load balancer, half the room
  // never sees an edit, a cursor, or a run result. The adapter fans every
  // room broadcast out over Redis pub/sub to all instances. It also makes the
  // BullMQ worker's io.to(roomId).emit("code:run-result") land in the room no
  // matter which instance picked the job up.
  pubClient = createRedisClient();
  subClient = createRedisClient();
  io.adapter(createAdapter(pubClient, subClient));

  pubClient.on("error", (err) => console.error("[socket] Redis pub error:", err?.message));
  subClient.on("error", (err) => console.error("[socket] Redis sub error:", err?.message));

  // Presence rosters live in Redis too; the heartbeat lets other instances
  // tell a live process from one that died with users still "in" a room.
  void RoomManager.startHeartbeat();
  console.log(`[socket] Instance ${INSTANCE_ID} — Redis adapter attached`);

  // Published so REST controllers can broadcast (room deletion, mainly).
  setIo(io);

  // Another instance deleted a room — drop everything we still hold for it.
  io.on(ROOM_PURGED, (roomId: string) => {
    purgeRoomLocally(roomId);
    console.log(`[socket] Purged local state for deleted room ${roomId}`);
  });

  io.use(socketAuthMiddleware);

  // ✅ NOT async — handlers registered synchronously so no events are dropped
  io.on("connection", (socket: Socket) => {
    // ✅ Register all handlers synchronously before any await
    registerRoomHandlers(io, socket);
    registerCodeHandlers(io, socket);
    registerCursorHandlers(io, socket);

    // ✅ Store the promise — handlers await this before reading username
    socket.data.ready = attachUserData(socket).then((ok) => {
      if (!ok) {
        socket.emit("error", "User not found");
        socket.disconnect(true);
        return;
      }
      console.log(`[socket] +CONNECT  ${socket.data.username} (${socket.data.userId}) [${socket.id}]`);
    });

    // ── Disconnect — single authoritative cleanup ─────────
    // Queued behind any in-flight join/leave for this socket, so a disconnect
    // can never overtake the join it is meant to undo.
    socket.on("disconnect", (reason) => serializeRoomOp(socket, async () => {
      // Wait for username to be available before cleanup
      await socket.data.ready;

      const userId   = socket.data.userId   as string;
      const username = socket.data.username as string;

      console.log(`[socket] -DISCONNECT ${username} (${userId}) — ${reason}`);

      const roomId = RoomManager.getRoomForSocket(socket.id);
      if (roomId) {
        await handleLeave(io, socket, userId, username, roomId, false);
      }
    }));
  });

  return io;
}

// ── Shutdown ──────────────────────────────────────────────
/** Drop this instance's presence entries and close its Redis connections. */
export async function closeSocketServer(io: Server): Promise<void> {
  await RoomManager.shutdown();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  pubClient?.disconnect();
  subClient?.disconnect();
  pubClient = null;
  subClient = null;
}
