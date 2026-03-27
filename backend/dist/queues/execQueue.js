import { Queue, Worker } from "bullmq";
import { createRedisClient } from "../config/redis.js";
import { runInDocker } from "./dockerRunner.js";
// ── Queue ─────────────────────────────────────────────────
export const execQueue = new Queue("exec", {
    connection: createRedisClient(),
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "fixed", delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
    },
});
// ── Add job helper ────────────────────────────────────────
export async function enqueueExec(data) {
    const job = await execQueue.add("run", data, {
        jobId: `exec-${data.roomId}-${Date.now()}`,
    });
    return job.id;
}
// ── Worker factory ────────────────────────────────────────
// Call once at server startup, passing the Socket.IO server.
export function startExecWorker(io) {
    const worker = new Worker("exec", async (job) => {
        const { roomId, code, language, socketId } = job.data;
        console.log(`[worker] Processing job ${job.id} — ${language} in room ${roomId}`);
        let result;
        try {
            result = await runInDocker(code, language);
        }
        catch (err) {
            result = {
                stdout: "",
                stderr: err?.message ?? "Unknown execution error",
                exitCode: 1,
                executionTimeMs: 0,
            };
        }
        // Emit result to everyone in the room (including the runner)
        io.to(roomId).emit("code:run-result", result);
        console.log(`[worker] Job ${job.id} done — exit ${result.exitCode} in ${result.executionTimeMs}ms`);
        return result;
    }, {
        connection: createRedisClient(),
        concurrency: 4, // max 4 Docker containers in parallel
    });
    worker.on("failed", (job, err) => {
        console.error(`[worker] Job ${job?.id} failed:`, err.message);
        if (job) {
            const { roomId } = job.data;
            io.to(roomId).emit("code:run-result", {
                stdout: "",
                stderr: `Execution failed: ${err.message}`,
                exitCode: 1,
                executionTimeMs: 0,
            });
        }
    });
    worker.on("ready", () => console.log("[worker] Exec worker is ready"));
    return worker;
}
//# sourceMappingURL=execQueue.js.map