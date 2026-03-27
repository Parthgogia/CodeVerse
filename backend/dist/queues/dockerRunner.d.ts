export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
}
export declare function runInDocker(code: string, language: string, timeoutMs?: number): Promise<ExecResult>;
//# sourceMappingURL=dockerRunner.d.ts.map