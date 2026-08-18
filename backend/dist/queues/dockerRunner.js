import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, rm, mkdir } from "fs/promises";
import { randomBytes } from "crypto";
const LANG_CONFIG = {
    javascript: {
        image: "node:20-alpine",
        filename: "main.js",
        cmd: (f) => ["node", f],
    },
    typescript: {
        image: "node:20-alpine",
        filename: "main.ts",
        // ts-node is pre-installed in the image command
        cmd: (f) => ["npx", "--yes", "ts-node", "--transpile-only", f],
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
const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds
// ── Main runner ───────────────────────────────────────────
export async function runInDocker(code, language, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
    // Step 2 — Build the Docker argv
    const dockerArgs = [
        "run", "--rm", // delete container immediately after exit
        "--network", "none", // no internet — can't exfiltrate data or download payloads
        "--memory", "256m", // hard RAM ceiling
        "--memory-swap", "256m", // swap = 0 (same as memory), prevents disk-backed memory abuse
        "--cpus", "0.5", // max half a CPU core
        "--pids-limit", "64", // prevents fork bombs (process.fork() spam)
        "--read-only", // container filesystem is immutable
        "--tmpfs", "/tmp:rw,size=32m,exec", // small writable scratch space (needed by some runtimes)
        "-v", `${tmpDir}:/code:ro`, // mount user code read-only — container can't modify it
        "-w", "/code", // working directory inside container
        cfg.image, ...cmd,
    ];
    // Step 3 — Spawn and collect output
    const start = Date.now();
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const proc = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
        // stdio: ["ignore", "pipe", "pipe"]` — stdin is disabled (user code can't block waiting for input), stdout and stderr are streamed back in real time.
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        // The settled flag ensures only one of these ever resolves the promise:
        // proc "close"  → normal exit  → resolve with exit code + output
        // setTimeout    → timed out    → SIGKILL proc, resolve with exitCode 124
        // proc "error"  → Docker not running / bad args → resolve with helpful error message
        // Hard timeout
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            proc.kill("SIGKILL");
            resolve({
                stdout: stdout.slice(0, 8192),
                stderr: `Execution timed out after ${timeoutMs / 1000}s`,
                exitCode: 124,
                executionTimeMs: Date.now() - start,
            });
            cleanup(tmpDir);
        }, timeoutMs);
        proc.on("close", (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({
                stdout: stdout.slice(0, 8192), // cap output
                stderr: stderr.slice(0, 4096),
                exitCode: code ?? 1,
                executionTimeMs: Date.now() - start,
            });
            cleanup(tmpDir);
        });
        proc.on("error", (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({
                stdout: "",
                stderr: `Failed to start Docker: ${err.message}\n\nMake sure Docker is running on the host.`,
                exitCode: 1,
                executionTimeMs: Date.now() - start,
            });
            cleanup(tmpDir);
        });
    });
}
async function cleanup(dir) {
    try {
        await rm(dir, { recursive: true, force: true });
    }
    catch { }
}
//# sourceMappingURL=dockerRunner.js.map