import type { Request, Response } from "express";
export declare const runCode: (req: Request & {
    userId?: string;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getJobStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=exec.contoller.d.ts.map