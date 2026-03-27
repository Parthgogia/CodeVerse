import { Queue, Worker } from "bullmq";
import type { Server } from "socket.io";
export interface ExecJobData {
    roomId: string;
    code: string;
    language: string;
    userId: string;
    socketId: string;
}
export declare const execQueue: Queue<ExecJobData, any, string, ExecJobData, any, string>;
export declare function enqueueExec(data: ExecJobData): Promise<string>;
export declare function startExecWorker(io: Server): Worker<ExecJobData>;
//# sourceMappingURL=execQueue.d.ts.map