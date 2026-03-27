import { Router } from "express";
import { runCode, getJobStatus } from "../controllers/exec.contoller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
const router = Router();
router.post("/", authMiddleware, runCode);
router.get("/:jobId", authMiddleware, getJobStatus);
export default router;
//# sourceMappingURL=exec.routes.js.map