import { PrismaClient } from "@prisma/client";
import { RoomManager } from "../realtime/roomManager.js";
const prisma = new PrismaClient();
// ── Map DB room → response shape expected by frontend ─────
function mapRoom(room) {
    return {
        id: room.id,
        name: room.name,
        description: room.description ?? undefined,
        language: room.language,
        isPublic: room.isPublic,
        ownerId: room.ownerId,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        activeUsers: RoomManager.getUserCount(room.id),
    };
}
// ── POST /api/rooms ───────────────────────────────────────
export const createRoom = async (req, res) => {
    try {
        const { name, description, language, isPublic } = req.body;
        if (!name?.trim())
            return res.status(400).json({ message: "Room name is required" });
        if (!language?.trim())
            return res.status(400).json({ message: "Language is required" });
        const room = await prisma.room.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                language: language.toLowerCase(),
                isPublic: isPublic ?? true,
                ownerId: req.userId,
            },
        });
        return res.status(201).json(mapRoom(room));
    }
    catch (err) {
        console.error("[room] createRoom error:", err);
        return res.status(500).json({ message: "Failed to create room" });
    }
};
// ── GET /api/rooms ────────────────────────────────────────
export const getRooms = async (req, res) => {
    try {
        const rooms = await prisma.room.findMany({
            where: { ownerId: req.userId },
            orderBy: { updatedAt: "desc" },
        });
        return res.json(rooms.map(mapRoom));
    }
    catch (err) {
        console.error("[room] getRooms error:", err);
        return res.status(500).json({ message: "Failed to fetch rooms" });
    }
};
// ── GET /api/rooms/:id ────────────────────────────────────
export const getRoom = async (req, res) => {
    const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!roomId)
        return res.status(400).json({ message: "Room id is required" });
    try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room)
            return res.status(404).json({ message: "Room not found" });
        return res.json(mapRoom(room));
    }
    catch (err) {
        console.error("[room] getRoom error:", err);
        return res.status(500).json({ message: "Failed to fetch room" });
    }
};
// ── PATCH /api/rooms/:id ──────────────────────────────────
export const updateRoom = async (req, res) => {
    const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!roomId)
        return res.status(400).json({ message: "Room id is required" });
    try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room)
            return res.status(404).json({ message: "Room not found" });
        if (room.ownerId !== req.userId)
            return res.status(403).json({ message: "Not the room owner" });
        const { name, description, language, isPublic } = req.body;
        const updated = await prisma.room.update({
            where: { id: roomId },
            data: {
                ...(name !== undefined && { name: name.trim() }),
                ...(description !== undefined && { description: description?.trim() || null }),
                ...(language !== undefined && { language: language.toLowerCase() }),
                ...(isPublic !== undefined && { isPublic }),
            },
        });
        return res.json(mapRoom(updated));
    }
    catch (err) {
        console.error("[room] updateRoom error:", err);
        return res.status(500).json({ message: "Failed to update room" });
    }
};
// ── DELETE /api/rooms/:id ─────────────────────────────────
export const deleteRoom = async (req, res) => {
    const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!roomId)
        return res.status(400).json({ message: "Room id is required" });
    try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room)
            return res.status(404).json({ message: "Room not found" });
        if (room.ownerId !== req.userId)
            return res.status(403).json({ message: "Not the room owner" });
        // Cascade delete snapshots (handled by Prisma schema onDelete: Cascade)
        await prisma.room.delete({ where: { id: roomId } });
        return res.status(204).send();
    }
    catch (err) {
        console.error("[room] deleteRoom error:", err);
        return res.status(500).json({ message: "Failed to delete room" });
    }
};
// ── GET /api/rooms/:id/snapshots ──────────────────────────
// Returns the N most recent snapshots for history
export const getRoomSnapshots = async (req, res) => {
    const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!roomId)
        return res.status(400).json({ message: "Room id is required" });
    try {
        const room = await prisma.room.findUnique({ where: { id: roomId } });
        if (!room)
            return res.status(404).json({ message: "Room not found" });
        const snapshots = await prisma.snapshot.findMany({
            where: { roomId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, createdAt: true, content: true },
        });
        return res.json(snapshots);
    }
    catch (err) {
        console.error("[room] getSnapshots error:", err);
        return res.status(500).json({ message: "Failed to fetch snapshots" });
    }
};
//# sourceMappingURL=room.controller.js.map