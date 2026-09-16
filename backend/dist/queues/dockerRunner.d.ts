export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
}
export declare const EXEC_LIMITS: {
    timeoutMs: number;
    memoryMb: number;
    cpus: number;
    pids: number;
    tmpfsMb: number;
    maxOutputBytes: number;
    maxCodeBytes: number;
};
export declare function isDockerAvailable(): boolean | null;
export declare function runInDocker(code: string, language: string, timeoutMs?: number): Promise<ExecResult>;
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
export declare function reapOrphanContainers(): Promise<number>;
/** Sweeps once immediately, then every `intervalMs`. Never keeps the process alive. */
export declare function startContainerReaper(intervalMs?: number): NodeJS.Timeout;
//# sourceMappingURL=dockerRunner.d.ts.map