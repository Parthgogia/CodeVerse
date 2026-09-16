import { prisma }            from "../config/db.js";
import { getRedis }          from "../config/redis.js";
import { INSTANCE_ID }       from "../realtime/roomManager.js";
import { isDockerAvailable } from "../queues/dockerRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// Health — two different questions, two different answers.
//
//   live   "is the process up?"            → always 200 while we can answer at all.
//          For an orchestrator deciding whether to *restart* us.
//   ready  "should traffic be sent here?"  → 200 only if the dependencies this
//          instance needs to serve a request are reachable AND we are not
//          draining. For a load balancer deciding whether to *route* to us.
//
// Every dependency probe is bounded by a timeout: a hung Postgres must make the
// probe say "timeout", not make the probe itself hang and take the load
// balancer's health check down with it.
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_TIMEOUT_MS = 1_500;

type CheckResult = "ok" | "fail" | "timeout";

export interface ReadinessReport {
  status:     "ok" | "degraded" | "draining";
  instanceId: string;
  uptime:     number;
  draining:   boolean;
  checks: {
    postgres: CheckResult;
    redis:    CheckResult;
    /** Informational only — execution is asynchronous via the queue, so an
     *  instance without Docker can still serve REST and WebSocket traffic. */
    docker:   "ok" | "unavailable" | "unknown";
  };
}

// Flipped by shutdown() before sockets are closed, so the load balancer's next
// probe pulls this instance out of rotation while it is still serving. That
// ordering — readiness first, sockets later — is the whole point of draining.
let draining = false;

export function markDraining(): void { draining = true; }
export function isDraining():   boolean { return draining; }

function withTimeout<T>(p: Promise<T>): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), CHECK_TIMEOUT_MS);
  });
  return Promise.race([
    p.then((): CheckResult => "ok", (): CheckResult => "fail"),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

export function liveness(): { status: "ok"; instanceId: string; uptime: number } {
  return { status: "ok", instanceId: INSTANCE_ID, uptime: Math.round(process.uptime()) };
}

export async function readiness(): Promise<ReadinessReport> {
  const [postgres, redis] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`),
    withTimeout(getRedis().ping()),
  ]);

  const dockerOk = isDockerAvailable();
  const docker   = dockerOk === null ? "unknown" : dockerOk ? "ok" : "unavailable";

  const healthy = postgres === "ok" && redis === "ok";
  return {
    status:     draining ? "draining" : healthy ? "ok" : "degraded",
    instanceId: INSTANCE_ID,
    uptime:     Math.round(process.uptime()),
    draining,
    checks:     { postgres, redis, docker },
  };
}
