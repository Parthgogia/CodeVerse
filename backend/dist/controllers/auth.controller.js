import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const prisma = new PrismaClient();
export const register = async (req, res) => {
    const { username, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { name: username, email, password: hashed }
    });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1d"
    });
    const mappedUser = {
        id: user.id,
        email: user.email,
        username: user.name,
        createdAt: user.createdAt,
    };
    res.json({ token, user: mappedUser });
};
export const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
        return res.status(401).json({ message: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
        expiresIn: "1d"
    });
    const mappedUser = {
        id: user.id,
        email: user.email,
        username: user.name,
        createdAt: user.createdAt,
    };
    res.json({ token, user: mappedUser });
};
export const me = async (req, res) => {
    const userId = req.userId;
    if (!userId)
        return res.status(401).json({ message: "Unauthorized" });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    const mappedUser = {
        id: user.id,
        email: user.email,
        username: user.name,
        createdAt: user.createdAt,
    };
    res.json(mappedUser);
};
//# sourceMappingURL=auth.controller.js.map