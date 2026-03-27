import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
export declare const createRoom: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getRooms: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getRoom: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateRoom: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteRoom: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getRoomSnapshots: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=room.controller.d.ts.map