import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import roomRoutes from "./routes/room.routes.js";
import execRoutes from "./routes/exec.routes.js";
import { createSocketServer } from "./realtime/socket.js";
import { startExecWorker } from "./queues/execQueue.js";
dotenv.config();
// ── Express app ───────────────────────────────────────────
const app = express();
app.use(cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
// ── REST routes ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/execute", execRoutes);
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));
// ── HTTP server — shared with Socket.IO ───────────────────
const httpServer = http.createServer(app);
// ── Socket.IO (attaches to same port) ─────────────────────
const io = createSocketServer(httpServer);
// ── BullMQ exec worker ─────────────────────────────────────
// Must receive io so it can emit run results back to rooms
startExecWorker(io);
// ── Start ─────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 4000);
httpServer.listen(PORT, () => {
    console.log(`🚀  Server listening on http://localhost:${PORT}`);
    console.log(`⚡  Socket.IO ready`);
    console.log(`🐳  Docker exec worker started`);
});
// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("SIGTERM received — shutting down");
    httpServer.close(() => process.exit(0));
});
//# sourceMappingURL=server.js.map