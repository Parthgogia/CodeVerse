import { Router } from "express";
import { liveness, readiness } from "../services/health.js";
// Unauthenticated by design: the load balancer and orchestrator probe these.
// They expose nothing but dependency reachability and an instance id.
const router = Router();
router.get("/live", (_req, res) => {
    res.json(liveness());
});
router.get("/ready", async (_req, res) => {
    const report = await readiness();
    res.status(report.status === "ok" ? 200 : 503).json(report);
});
export default router;
//# sourceMappingURL=health.routes.js.map