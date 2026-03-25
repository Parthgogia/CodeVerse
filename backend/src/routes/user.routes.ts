import { Router } from "express";
import { prisma } from "../config/db.js";

const router = Router();

// create user
router.post("/", async (req, res) => {
  try {
    const { email, name } = req.body;

    const user = await prisma.user.create({
      data: { email, name },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// get all users
router.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;