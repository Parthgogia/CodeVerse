import { PrismaClient } from "@prisma/client";
import { execQueue, enqueueExec } from "../queues/execQueue.js";
const prisma = new PrismaClient();
// POST /api/execute
// Body: { roomId, code, language }
// Returns: { jobId }
export const runCode = async (req, res) => {
    const { roomId, code, language } = req.body;
    const userId = req.userId ?? "anonymous";
    const socketId = req.headers["x-socket-id"] ?? "";
    if (!code || !language) {
        return res.status(400).json({ message: "code and language are required" });
    }
    if (!roomId) {
        return res.status(400).json({ message: "roomId is required" });
    }
    // Verify room exists
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room)
        return res.status(404).json({ message: "Room not found" });
    try {
        const jobId = await enqueueExec({ roomId, code, language, userId, socketId });
        return res.json({ jobId });
    }
    catch (err) {
        console.error("[exec] Failed to enqueue job:", err);
        return res.status(500).json({ message: "Failed to queue execution job" });
    }
};
// GET /api/execute/:jobId
// Polling fallback — the frontend uses this if the socket result doesn't arrive
export const getJobStatus = async (req, res) => {
    let jobId = req.params.jobId;
    if (Array.isArray(jobId)) {
        jobId = jobId[0];
    }
    if (!jobId) {
        return res.status(400).json({ message: "jobId is required" });
    }
    try {
        const [job, queueState] = await Promise.all([
            execQueue.getJob(jobId),
            execQueue.getJobState(jobId).catch(() => null),
        ]);
        if (!job) {
            if (queueState === "completed" || queueState === "failed") {
                return res.json({
                    id: jobId,
                    status: queueState === "completed" ? "completed" : "failed",
                    stdout: "",
                    stderr: queueState === "failed" ? "Job result expired from queue" : "",
                    exitCode: queueState === "failed" ? 1 : 0,
                    executionTimeMs: 0,
                    language: "unknown",
                    createdAt: new Date().toISOString(),
                });
            }
            return res.status(404).json({ message: "Job not found" });
        }
        const state = await job.getState();
        if (state === "completed") {
            const result = job.returnvalue;
            return res.json({
                id: job.id,
                status: "completed",
                stdout: result?.stdout ?? "",
                stderr: result?.stderr ?? "",
                exitCode: result?.exitCode ?? 0,
                executionTimeMs: result?.executionTimeMs ?? 0,
                language: job.data.language,
                createdAt: new Date(job.timestamp).toISOString(),
            });
        }
        if (state === "failed") {
            return res.json({
                id: job.id,
                status: "failed",
                stdout: "",
                stderr: job.failedReason ?? "Job failed",
                exitCode: 1,
                language: job.data.language,
                createdAt: new Date(job.timestamp).toISOString(),
            });
        }
        return res.json({
            id: job.id,
            status: state === "active" ? "running" : "pending",
            language: job.data.language,
            createdAt: new Date(job.timestamp).toISOString(),
        });
    }
    catch (err) {
        console.error("[exec] Failed to fetch job:", err);
        return res.status(500).json({ message: "Failed to fetch job status" });
    }
};
//# sourceMappingURL=exec.contoller.js.map