import { Router } from "express";
import { runCode } from "../controllers/exec.contoller.js";

const router = Router();

router.post("/", runCode);

export default router;