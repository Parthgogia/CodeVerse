import { Router } from "express";
import {
  createRoom,
  getRooms,
  getRoom,
  updateRoom,
  deleteRoom,
  getRoomSnapshots,
} from "../controllers/room.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// All room routes require auth
router.use(authMiddleware);

router.post("/",                  createRoom);
router.get("/",                   getRooms);
router.get("/:id",                getRoom);
router.patch("/:id",              updateRoom);
router.delete("/:id",             deleteRoom);
router.get("/:id/snapshots",      getRoomSnapshots);

export default router;