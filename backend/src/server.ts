import http    from "http";
import express, { type Request, type Response, type NextFunction } from "express";
import cors    from "cors";
import dotenv  from "dotenv";

dotenv.config();

// ── Startup validation ────────────────────────────────────
// Fail immediately with a clear message rather than a cryptic JWT error
// at the first login attempt.
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\n❌  Missing required env vars: ${missing.join(", ")}`);
  console.error("    Copy .env.example → .env and fill in the values.\n");
  process.exit(1);
}

import authRoutes from "./routes/auth.routes.js";
import roomRoutes from "./routes/room.routes.js";
import execRoutes from "./routes/exec.routes.js";
import { createSocketServer } from "./realtime/socket.js";
import { startExecWorker }    from "./queues/execQueue.js";
import { prisma }             from "./config/db.js";

// ── Express ───────────────────────────────────────────────
const app = express();

app.use(cors({
  origin:      process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

// ── Routes ────────────────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/rooms",   roomRoutes);
app.use("/api/execute", execRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

// ── Global error handler ──────────────────────────────────
// Catches any error thrown (or passed to next()) in a route handler.
// Without this, Express 4 hangs the request on async throws.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled error:", err);
  const status = (err as any).status ?? 500;
  res.status(status).json({
    message: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ── HTTP + Socket.IO ──────────────────────────────────────
const httpServer = http.createServer(app);
const io         = createSocketServer(httpServer);

// Worker must receive io so it can emit results back to rooms
startExecWorker(io);

// ── Listen ────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 4000);

httpServer.listen(PORT, () => {
  console.log(`\n🚀  API      →  http://localhost:${PORT}/api`);
  console.log(`⚡  Sockets  →  ws://localhost:${PORT}`);
  console.log(`🐳  Worker   →  BullMQ exec queue running\n`);
});

// ── Graceful shutdown ─────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully`);
  httpServer.close(async () => {
    await prisma.$disconnect();
    console.log("Shutdown complete.");
    process.exit(0);
  });
  // Force exit after 10 s if something hangs
  setTimeout(() => { console.error("Forced exit after timeout"); process.exit(1); }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled promise rejections before they silently kill the worker
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});