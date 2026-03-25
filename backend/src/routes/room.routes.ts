import { Router } from "express";
import { createRoom, getRooms, getRoom } from "../controllers/room.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authMiddleware, createRoom);
router.get("/", authMiddleware, getRooms);
router.get("/:id", authMiddleware, getRoom);

export default router;