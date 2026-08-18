import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
// ── Shared mapper ─────────────────────────────────────────
function mapUser(user) {
    return { id: user.id, email: user.email, username: user.name, createdAt: user.createdAt };
}
function signToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
// ── POST /api/auth/register ───────────────────────────────
export const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username?.trim()) {
            res.status(400).json({ message: "Username is required" });
            return;
        }
        if (!email?.trim()) {
            res.status(400).json({ message: "Email is required" });
            return;
        }
        if (!password) {
            res.status(400).json({ message: "Password is required" });
            return;
        }
        if (password.length < 8) {
            res.status(400).json({ message: "Password must be at least 8 characters" });
            return;
        }
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists) {
            res.status(409).json({ message: "Email already in use" });
            return;
        }
        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name: username.trim(), email: email.trim().toLowerCase(), password: hashed },
        });
        res.status(201).json({ token: signToken(user.id), user: mapUser(user) });
    }
    catch (err) {
        console.error("[auth] register error:", err);
        res.status(500).json({ message: "Registration failed" });
    }
};
// ── POST /api/auth/login ──────────────────────────────────
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ message: "Email and password are required" });
            return;
        }
        const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (!user) {
            res.status(401).json({ message: "Invalid credentials" });
            return;
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            res.status(401).json({ message: "Invalid credentials" });
            return;
        }
        res.json({ token: signToken(user.id), user: mapUser(user) });
    }
    catch (err) {
        console.error("[auth] login error:", err);
        res.status(500).json({ message: "Login failed" });
    }
};
// ── GET /api/auth/me ──────────────────────────────────────
export const me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        // Return just the user — no token (frontend already has it)
        res.json(mapUser(user));
    }
    catch (err) {
        console.error("[auth] me error:", err);
        res.status(500).json({ message: "Failed to fetch user" });
    }
};
//# sourceMappingURL=auth.controller.js.map