import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { registerRoomHandlers, handleLeave } from "../handlers/room.handlers.js";
import { registerCodeHandlers } from "../handlers/code.handlers.js";
import { registerCursorHandlers } from "../handlers/cursor.handlers.js";
import { RoomManager } from "./roomManager.js";
const prisma = new PrismaClient();
// ── Socket.IO auth middleware ─────────────────────────────
function socketAuthMiddleware(socket, next) {
    const token = socket.handshake.auth?.token;
    if (!token)
        return next(new Error("No token provided"));
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = payload.userId;
        next();
    }
    catch {
        next(new Error("Invalid token"));
    }
}
// ── Hydrate username from DB onto socket.data ─────────────
async function attachUserData(socket) {
    try {
        const user = await prisma.user.findUnique({ where: { id: socket.data.userId } });
        if (!user)
            return false;
        socket.data.username = user.name;
        return true;
    }
    catch {
        return false;
    }
}
// ── Factory ───────────────────────────────────────────────
export function createSocketServer(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
            credentials: true,
        },
        pingTimeout: 20_000,
        pingInterval: 10_000,
        maxHttpBufferSize: 5 * 1024 * 1024, // 5 MB — for Yjs binary payloads
    });
    io.use(socketAuthMiddleware);
    io.on("connection", async (socket) => {
        const ok = await attachUserData(socket);
        if (!ok) {
            socket.emit("error", "User not found");
            socket.disconnect(true);
            return;
        }
        const userId = socket.data.userId;
        const username = socket.data.username;
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
//# sourceMappingURL=socket.js.map