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
            const out = f.replace(".cpp", "");
            // compile then run; joined via sh -c
            return ["sh", "-c", `g++ -o ${out} ${f} && ${out}`];
        },
    },
    java: {
        image: "openjdk:21-slim",
        filename: "Main.java",
        cmd: (f) => {
            const dir = f.replace("/Main.java", "");
            return ["sh", "-c", `cd ${dir} && javac Main.java && java Main`];
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
    // Create a unique temp directory for this run
    const runId = randomBytes(8).toString("hex");
    const tmpDir = join(tmpdir(), `codesync-${runId}`);
    await mkdir(tmpDir, { recursive: true });
    const filePath = join(tmpDir, cfg.filename);
    await writeFile(filePath, code, "utf-8");
    const containerFile = `/code/${cfg.filename}`;
    const cmd = cfg.cmd(containerFile);
    const dockerArgs = [
        "run",
        "--rm", // auto-remove container
        "--network", "none", // no network access
        "--memory", "256m", // 256 MB RAM limit
        "--memory-swap", "256m", // no swap
        "--cpus", "0.5", // half a CPU
        "--pids-limit", "64", // no fork bombs
        "--read-only", // read-only filesystem
        "--tmpfs", "/tmp:rw,size=32m", // writable /tmp for scratch
        "-v", `${tmpDir}:/code:ro`, // mount code read-only
        "-w", "/code",
        cfg.image,
        ...cmd,
    ];
    const start = Date.now();
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        const proc = spawn("docker", dockerArgs, { stdio: ["ignore", "pipe", "pipe"] });
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
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