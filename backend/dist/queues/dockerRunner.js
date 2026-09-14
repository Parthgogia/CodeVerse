import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, rm, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
// ── Resource limits ───────────────────────────────────────
// Every run is boxed by all of these at once. Each is overridable via env so a
// deployment can tune without a code change; the defaults are sized so that the
// worker's four concurrent runs fit comfortably on a laptop (2 cores, 1 GB).
const envNum = (name, fallback) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
};
export const EXEC_LIMITS = {
    timeoutMs: envNum("EXEC_TIMEOUT_MS", 10_000), // wall clock, enforced from the host
    memoryMb: envNum("EXEC_MEMORY_MB", 256), // cgroup hard cap; the OOM killer fires above it
    cpus: envNum("EXEC_CPUS", 0.5), // share of one core
    pids: envNum("EXEC_PIDS", 64), // fork-bomb ceiling
    tmpfsMb: envNum("EXEC_TMPFS_MB", 32), // the only writable space inside the container
    maxOutputBytes: envNum("EXEC_MAX_OUTPUT_BYTES", 64 * 1024), // stdout+stderr combined; the run is stopped past this
    maxCodeBytes: envNum("EXEC_MAX_CODE_BYTES", 64 * 1024), // checked at POST /api/execute before queueing
};
// How much of the captured output is returned to the client.
const STDOUT_SHOW = 8192;
const STDERR_SHOW = 4096;
// Every sandbox container carries this label so the reaper can find them.
const CONTAINER_LABEL = "codeverse.exec=1";
const LANG_CONFIG = {
    javascript: {
        image: "node:20-alpine",
        filename: "main.js",
        cmd: (f) => ["node", f],
    },
    typescript: {
        // Purpose-built image (sandbox/typescript.Dockerfile) with tsx baked in.
        // The container has no network, so the toolchain cannot be fetched at run
        // time — `npx ts-node` used to fail here with EAI_AGAIN on every run.
        image: "codeverse-sandbox-ts",
        filename: "main.ts",
        cmd: (f) => ["tsx", f],
    },
    python: {
        image: "python:3.12-alpine",
        filename: "main.py",
        cmd: (f) => ["python", f],
    },
    cpp: {
        image: "gcc:13",
        filename: "main.cpp",
        cmd: (f) => {
            // compile to /tmp since /code is read-only
            return ["sh", "-c", `g++ -o /tmp/main ${f} && /tmp/main`];
        },
    },
    java: {
        image: "eclipse-temurin:21-alpine",
        filename: "Main.java",
        cmd: (f) => {
            // copy to /tmp and compile/run there since /code is read-only
            return ["sh", "-c", `cp ${f} /tmp/ && cd /tmp && javac Main.java && java Main`];
        },
    },
};
// ── Docker CLI helpers ────────────────────────────────────
function docker(args) {
    return new Promise((resolve, reject) => {
        const p = spawn("docker", args, { stdio: ["ignore", "pipe", "ignore"] });
        let out = "";
        p.stdout.on("data", (d) => { out += d.toString(); });
        p.on("error", reject);
        p.on("close", () => resolve(out));
    });
}
// `rm -f` rather than `kill`: it works whether the container is still running or
// has already exited-and-not-yet-been-auto-removed, so it never races `--rm`.
async function removeContainer(name) {
    try {
        await docker(["rm", "-f", name]);
    }
    catch { }
}
// ── Main runner ───────────────────────────────────────────
export async function runInDocker(code, language, timeoutMs = EXEC_LIMITS.timeoutMs) {
    const cfg = LANG_CONFIG[language.toLowerCase()];
    if (!cfg) {
        return {
            stdout: "",
            stderr: `Unsupported language: ${language}`,
            exitCode: 1,
            executionTimeMs: 0,
        };
    }
    //Step 1 — Create a unique temp directory for this run
    const runId = randomBytes(8).toString("hex");
    const tmpDir = join(tmpdir(), `codeverse-${runId}`);
    //Each execution gets its own isolated directory (/tmp/codesync-<random>).
    // The user's code is written to disk here. randomBytes prevents any two runs from colliding.
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, cfg.filename);
    await writeFile(filePath, code, "utf-8");
    const containerFile = `/code/${cfg.filename}`;
    const cmd = cfg.cmd(containerFile);
    const name = `codeverse-exec-${runId}`;
    // Kernel-enforced CPU-time backstop. The wall-clock timer below is the primary
    // limit, but it lives in this process — which restarts on every save under
    // `tsx watch` and can crash in production — and a container outlives its
    // parent. At `cpus` of a core a busy loop needs timeoutMs / cpus of wall time
    // to accumulate this much CPU, so for a live worker it never fires before the
    // timer; it only ever catches orphans. Soft limit raises SIGXCPU (exit 152),
    // hard limit two seconds later is SIGKILL for anything that ignores it.
    const cpuSecs = Math.ceil(timeoutMs / 1000);
    // Step 2 — Build the Docker argv
    const dockerArgs = [
        "run", "--rm", // delete container immediately after exit
        "--name", name, // addressable, so a timeout can actually kill it
        "--label", CONTAINER_LABEL, // discoverable by the reaper
        "--network", "none", // no internet — can't exfiltrate data or download payloads
        "--memory", `${EXEC_LIMITS.memoryMb}m`, // hard RAM ceiling
        "--memory-swap", `${EXEC_LIMITS.memoryMb}m`, // swap = 0 (same as memory), prevents disk-backed memory abuse
        "--cpus", String(EXEC_LIMITS.cpus), // fraction of a core
        "--pids-limit", String(EXEC_LIMITS.pids), // prevents fork bombs (process.fork() spam)
        "--ulimit", `cpu=${cpuSecs}:${cpuSecs + 2}`, // CPU-seconds backstop (see above)
        "--read-only", // container filesystem is immutable
        "--tmpfs", `/tmp:rw,size=${EXEC_LIMITS.tmpfsMb}m,exec`, // small writable scratch space (needed by some runtimes)
        "-v", `${tmpDir}:/code:ro`, // mount user code read-only — container can't modify it
        "-w", "/code", // working directory inside container
        cfg.image, ...cmd,
    ];
    // Step 3 — Spawn and collect output
    const start = Date.now();
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let outBytes = 0;
        let settled = false;
        const proc = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
        // stdio: ["ignore", "pipe", "pipe"]` — stdin is disabled (user code can't block waiting for input), stdout and stderr are streamed back in real time.
        // Exactly one of these resolves the promise:
        //   proc "close"  → normal exit         → exit code + output
        //   setTimeout    → wall clock exceeded → container removed, exit 124
        //   output cap    → too much output     → container removed, exit 1
        //   proc "error"  → Docker not running  → helpful error message
        // `finish` is the single exit path so the container is always gone before
        // the bind-mounted tmpDir is deleted from under it.
        const finish = (result, killContainer) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
            (killContainer ? removeContainer(name) : Promise.resolve()).then(() => cleanup(tmpDir));
        };
        // Output is accumulated in *this* process, so an unbounded `while(true)
        // print()` would grow a string here for the whole timeout — the cap protects
        // the API server, not the sandbox.
        const onData = (stream) => (d) => {
            if (settled)
                return;
            outBytes += d.length;
            if (stream === "stdout")
                stdout += d.toString();
            else
                stderr += d.toString();
            if (outBytes > EXEC_LIMITS.maxOutputBytes) {
                finish({
                    stdout: stdout.slice(0, STDOUT_SHOW),
                    stderr: `Output limit exceeded (${EXEC_LIMITS.maxOutputBytes / 1024} KB) — execution stopped.`,
                    exitCode: 1,
                    executionTimeMs: Date.now() - start,
                }, true);
            }
        };
        proc.stdout.on("data", onData("stdout"));
        proc.stderr.on("data", onData("stderr"));
        // Hard timeout. Killing `proc` alone would only kill the docker *client*
        // and leave the container running in the daemon — that was a real bug.
        const timer = setTimeout(() => {
            finish({
                stdout: stdout.slice(0, STDOUT_SHOW),
                stderr: `Execution timed out after ${timeoutMs / 1000}s`,
                exitCode: 124,
                executionTimeMs: Date.now() - start,
            }, true);
        }, timeoutMs);
        proc.on("close", (code) => {
            const exitCode = code ?? 1;
            let err = stderr.slice(0, STDERR_SHOW);
            const note = (msg) => { err += (err && !err.endsWith("\n") ? "\n" : "") + msg; };
            // Our own kills settle before "close", so a signal exit seen here came
            // from inside the sandbox: 137 = SIGKILL, which in a cgroup with a memory
            // cap is the OOM killer; 152 = SIGXCPU from the CPU-time ulimit.
            if (exitCode === 137)
                note(`Killed — memory limit exceeded (${EXEC_LIMITS.memoryMb} MB).`);
            if (exitCode === 152)
                note(`Killed — CPU time limit exceeded (${cpuSecs}s).`);
            finish({
                stdout: stdout.slice(0, STDOUT_SHOW),
                stderr: err,
                exitCode,
                executionTimeMs: Date.now() - start,
            }, false);
        });
        proc.on("error", (err) => {
            finish({
                stdout: "",
                stderr: `Failed to start Docker: ${err.message}\n\nMake sure Docker is running on the host.`,
                exitCode: 1,
                executionTimeMs: Date.now() - start,
            }, false);
        });
    });
}
async function cleanup(dir) {
    try {
        await rm(dir, { recursive: true, force: true });
    }
    catch { }
}
// ── Orphan reaper ─────────────────────────────────────────
/**
 * Removes sandbox containers that have outlived the timeout. Normally there are
 * none — `runInDocker` tears its own container down — but the timer lives in
 * this process, and when the process dies mid-run (a `tsx watch` restart, a
 * crash, a SIGKILL from the orchestrator) the container survives it. Before
 * this existed, every interrupted infinite loop kept burning half a core until
 * Docker Desktop fell over.
 *
 * Age-based rather than "everything with the label" so that a second instance
 * starting on the same host never kills a sibling's in-flight run.
 */
export async function reapOrphanContainers() {
    const ids = (await docker(["ps", "-q", "--filter", `label=${CONTAINER_LABEL}`])).trim().split(/\s+/).filter(Boolean);
    if (!ids.length)
        return 0;
    const cutoff = Date.now() - EXEC_LIMITS.timeoutMs - 15_000;
    const stale = (await docker(["inspect", "-f", "{{.Id}} {{.Created}}", ...ids]))
        .trim().split("\n")
        .map((line) => line.split(" "))
        .filter(([, created]) => Date.parse(created ?? "") < cutoff)
        .map(([id]) => id);
    if (stale.length)
        await docker(["rm", "-f", ...stale]);
    return stale.length;
}
/** Sweeps once immediately, then every `intervalMs`. Never keeps the process alive. */
export function startContainerReaper(intervalMs = 60_000) {
    const sweep = () => reapOrphanContainers()
        .then((n) => { if (n)
        console.log(`[worker] Reaped ${n} orphaned exec container(s)`); })
        .catch((err) => console.warn("[worker] Reaper sweep failed:", err?.message ?? err));
    sweep();
    const timer = setInterval(sweep, intervalMs);
    timer.unref();
    return timer;
}
//# sourceMappingURL=dockerRunner.js.map