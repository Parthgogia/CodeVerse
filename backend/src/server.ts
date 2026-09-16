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

import authRoutes   from "./routes/auth.routes.js";
import roomRoutes   from "./routes/room.routes.js";
import execRoutes   from "./routes/exec.routes.js";
import healthRoutes from "./routes/health.routes.js";
import { createSocketServer, closeSocketServer } from "./realtime/socket.js";
import { RoomDocs }            from "./realtime/roomDocs.js";
import { INSTANCE_ID }         from "./realtime/roomManager.js";
import { startExecWorker }    from "./queues/execQueue.js";
import { markDraining, readiness } from "./services/health.js";
import { prisma }             from "./config/db.js";

// ── Express ───────────────────────────────────────────────
const app = express();

// Behind the edge proxy, the client address and scheme arrive in
// X-Forwarded-* headers; without this, req.ip is the proxy and req.protocol
// is "http" even on an HTTPS request.
app.set("trust proxy", 1);

app.use(cors({
  origin:      process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

// Which instance answered — lets a load-balanced deployment be verified from
// the outside, and lets a log line be matched to a process.
app.use((_req, res, next) => {
  res.setHeader("X-Instance-Id", INSTANCE_ID);
  next();
});

// ── Routes ────────────────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/rooms",   roomRoutes);
app.use("/api/execute", execRoutes);
app.use("/health",      healthRoutes);

// Kept for anything that already probes it; same answer as /health/ready.
app.get("/api/health", async (_req, res) => {
  const report = await readiness();
  res.status(report.status === "ok" ? 200 : 503).json(report);
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
let shuttingDown = false;

/** How long readiness reports 503 before sockets are closed — long enough for
 *  the load balancer's next active probe (3 s in edge/Caddyfile) to notice. */
const SHUTDOWN_DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS ?? 4_000);

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — draining for ${SHUTDOWN_DRAIN_MS}ms, then shutting down`);

  // Force exit if something hangs after the drain
  const force = setTimeout(() => {
    console.error("Forced exit after timeout");
    process.exit(1);
  }, SHUTDOWN_DRAIN_MS + 10_000);
  force.unref?.();

  try {
    // 1. Stop being *chosen* before we stop *serving*: /health/ready flips to
    //    503 so the load balancer pulls this instance out of rotation while it
    //    is still answering everything it is sent. Closing sockets first would
    //    hand the balancer a burst of failed connections instead.
    markDraining();
    await new Promise((r) => setTimeout(r, SHUTDOWN_DRAIN_MS));

    // 2. Closes Socket.IO (and with it the HTTP server), drops this instance's
    // presence entries from Redis so other instances don't count ghosts, and
    // releases the adapter's pub/sub connections.
    await closeSocketServer(io);
    // Sockets are gone, so no further edits can arrive — write every open
    // document out before the DB connection closes. Without this, edits made
    // inside the last save-debounce window would be lost on restart.
    await RoomDocs.flushAll();
    await prisma.$disconnect();
    console.log("Shutdown complete.");
    process.exit(0);
  } catch (err) {
    console.error("[server] Shutdown error:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled promise rejections before they silently kill the worker
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});