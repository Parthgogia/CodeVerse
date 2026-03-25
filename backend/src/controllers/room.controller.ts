import type { Response } from "express";
import { PrismaClient } from "@prisma/client";
import type { AuthRequest } from "../middleware/auth.middleware.js";

const prisma = new PrismaClient();

export const createRoom = async (req: AuthRequest, res: Response) => {
  const { name, language } = req.body;

  const room = await prisma.room.create({
    data: {
      name,
      language,
      ownerId: req.userId!
    }
  });

  res.json(room);
};

export const getRooms = async (_: AuthRequest, res: Response) => {
  const rooms = await prisma.room.findMany();
  res.json(rooms);
};