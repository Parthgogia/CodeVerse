interface RateLimitOptions {
    maxPerWindow: number;
    windowSecs: number;
}
/**
 * Returns true if the action is ALLOWED, false if rate-limited.
 * Key format: rl:{event}:{userId}
 */
export declare function checkRateLimit(userId: string, event: string, opts: RateLimitOptions): Promise<boolean>;
export declare const Limits: {
    readonly CODE_CHANGE: {
        readonly maxPerWindow: 120;
        readonly windowSecs: 10;
    };
    readonly CURSOR_MOVE: {
        readonly maxPerWindow: 300;
        readonly windowSecs: 10;
    };
    readonly RUN_CODE: {
        readonly maxPerWindow: 5;
        readonly windowSecs: 30;
    };
    readonly JOIN_ROOM: {
        readonly maxPerWindow: 10;
        readonly windowSecs: 30;
    };
    readonly YJS_UPDATE: {
        readonly maxPerWindow: 200;
        readonly windowSecs: 10;
    };
};
export {};
//# sourceMappingURL=rateLimiter.d.ts.map