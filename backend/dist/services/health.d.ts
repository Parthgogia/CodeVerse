type CheckResult = "ok" | "fail" | "timeout";
export interface ReadinessReport {
    status: "ok" | "degraded" | "draining";
    instanceId: string;
    uptime: number;
    draining: boolean;
    checks: {
        postgres: CheckResult;
        redis: CheckResult;
        /** Informational only — execution is asynchronous via the queue, so an
         *  instance without Docker can still serve REST and WebSocket traffic. */
        docker: "ok" | "unavailable" | "unknown";
    };
}
export declare function markDraining(): void;
export declare function isDraining(): boolean;
export declare function liveness(): {
    status: "ok";
    instanceId: string;
    uptime: number;
};
export declare function readiness(): Promise<ReadinessReport>;
export {};
//# sourceMappingURL=health.d.ts.map