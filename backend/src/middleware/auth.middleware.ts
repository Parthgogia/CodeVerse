import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: string;
}

export const authMiddleware = (
  req:  AuthRequest,
  res:  Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;
  const token      = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;           // also accept bare token (non-standard but forgiving)

  if (!token) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId    = decoded.userId;
    next();
  } catch (err: any) {
    const message = err?.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ message });
  }
};