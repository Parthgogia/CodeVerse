import { prisma } from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { INSTANCE_ID } from "../realtime/roomManager.js";
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
// Flipped by shutdown() before sockets are closed, so the load balancer's next
// probe pulls this instance out of rotation while it is still serving. That
// ordering — readiness first, sockets later — is the whole point of draining.
let draining = false;
export function markDraining() { draining = true; }
export function isDraining() { return draining; }
function withTimeout(p) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), CHECK_TIMEOUT_MS);
    });
    return Promise.race([
        p.then(() => "ok", () => "fail"),
        timeout,
    ]).finally(() => clearTimeout(timer));
}
export function liveness() {
    return { status: "ok", instanceId: INSTANCE_ID, uptime: Math.round(process.uptime()) };
}
export async function readiness() {
    const [postgres, redis] = await Promise.all([
        withTimeout(prisma.$queryRaw `SELECT 1`),
        withTimeout(getRedis().ping()),
    ]);
    const dockerOk = isDockerAvailable();
    const docker = dockerOk === null ? "unknown" : dockerOk ? "ok" : "unavailable";
    const healthy = postgres === "ok" && redis === "ok";
    return {
        status: draining ? "draining" : healthy ? "ok" : "degraded",
        instanceId: INSTANCE_ID,
        uptime: Math.round(process.uptime()),
        draining,
        checks: { postgres, redis, docker },
    };
}
//# sourceMappingURL=health.js.map