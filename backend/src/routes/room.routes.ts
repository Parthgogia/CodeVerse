import { Router } from "express";
import { createRoom, getRooms } from "../controllers/room.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authMiddleware, createRoom);
router.get("/", authMiddleware, getRooms);

export default router;