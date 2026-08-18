import { randomUUID } from "crypto";
import { getRedis } from "../config/redis.js";
export const INSTANCE_ID = randomUUID();
const HEARTBEAT_TTL_SECS = 30;
const HEARTBEAT_EVERY_MS = 10_000;
// Backstop for a roster nobody ever reads again: if every instance holding a
// room dies without cleaning up (a `tsx watch` reload, a SIGKILL), its hash is
// pruned on the next read — but if that read never comes, this expiry collects
// it. Refreshed on every heartbeat for rooms that still have members here, so
// a busy room never expires underneath us.
const ROOM_KEY_TTL_SECS = 3_600;
const roomKey = (roomId) => `presence:room:${roomId}`;
const instanceKey = (id) => `presence:instance:${id}`;
// Deterministic color from userId so the same user always gets the same color
const PALETTE = [
    "#5b4ef0", "#10b981", "#f59e0b", "#f43f5e",
    "#8b5cf6", "#22d3ee", "#ec4899", "#f97316",
];
function colorForUser(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++)
        hash = (hash + userId.charCodeAt(i)) & 0xffffffff;
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
// ── Local state (this process only) ───────────────────────
// socketId → roomId
const socketRoom = new Map();
// roomId → Map<socketId, RoomUser> — mirror of our own sockets. Serves reads
// when Redis is unreachable so a Redis blip degrades to single-process
// behaviour instead of emptying every room.
const localRooms = new Map();
let heartbeat = null;
function localAdd(roomId, user) {
    if (!localRooms.has(roomId))
        localRooms.set(roomId, new Map());
    localRooms.get(roomId).set(user.socketId, user);
}
function localRemove(roomId, socketId) {
    const room = localRooms.get(roomId);
    if (!room)
        return null;
    const user = room.get(socketId) ?? null;
    room.delete(socketId);
    if (room.size === 0)
        localRooms.delete(roomId);
    return user;
}
function localUsers(roomId) {
    return Array.from(localRooms.get(roomId)?.values() ?? []);
}
/** Drop entries written by instances whose heartbeat has expired. */
async function pruneStale(roomId, entries) {
    const redis = getRedis();
    const parsed = [];
    for (const raw of Object.values(entries)) {
        try {
            parsed.push(JSON.parse(raw));
        }
        catch { /* skip corrupt entry */ }
    }
    const foreign = [...new Set(parsed.map((u) => u.instanceId))].filter((id) => id !== INSTANCE_ID);
    const alive = new Set([INSTANCE_ID]);
    if (foreign.length) {
        const pipeline = redis.pipeline();
        foreign.forEach((id) => pipeline.exists(instanceKey(id)));
        const results = await pipeline.exec();
        foreign.forEach((id, i) => {
            if (results?.[i]?.[1])
                alive.add(id);
        });
    }
    const users = [];
    const dead = [];
    for (const user of parsed) {
        if (alive.has(user.instanceId))
            users.push(user);
        else
            dead.push(user.socketId);
    }
    if (dead.length) {
        await redis.hdel(roomKey(roomId), ...dead).catch(() => { });
        console.warn(`[presence] Pruned ${dead.length} stale entries from ${roomId}`);
    }
    return users;
}
export const RoomManager = {
    // ── Lifecycle ─────────────────────────────────────────────
    /** Publish this instance's heartbeat. Call once, before accepting sockets. */
    async startHeartbeat() {
        const redis = getRedis();
        const beat = async () => {
            try {
                const pipeline = redis.pipeline();
                pipeline.set(instanceKey(INSTANCE_ID), Date.now().toString(), "EX", HEARTBEAT_TTL_SECS);
                // Keep the rosters we are part of from expiring while they are in use
                for (const roomId of localRooms.keys())
                    pipeline.expire(roomKey(roomId), ROOM_KEY_TTL_SECS);
                await pipeline.exec();
            }
            catch (err) {
                console.error("[presence] Heartbeat failed:", err?.message);
            }
        };
        await beat();
        heartbeat = setInterval(beat, HEARTBEAT_EVERY_MS);
        heartbeat.unref?.();
    },
    /** Remove every trace of this instance — called on graceful shutdown. */
    async shutdown() {
        if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
        }
        try {
            const pipeline = getRedis().pipeline();
            for (const [roomId, users] of localRooms) {
                for (const socketId of users.keys())
                    pipeline.hdel(roomKey(roomId), socketId);
            }
            pipeline.del(instanceKey(INSTANCE_ID));
            await pipeline.exec();
        }
        catch (err) {
            console.error("[presence] Shutdown cleanup failed:", err?.message);
        }
        socketRoom.clear();
        localRooms.clear();
    },
    // ── Join ──────────────────────────────────────────────────
    async join(roomId, user) {
        const full = {
            ...user,
            color: colorForUser(user.userId),
            joinedAt: Date.now(),
            instanceId: INSTANCE_ID,
        };
        socketRoom.set(user.socketId, roomId);
        localAdd(roomId, full);
        try {
            await getRedis()
                .pipeline()
                .hset(roomKey(roomId), user.socketId, JSON.stringify(full))
                .expire(roomKey(roomId), ROOM_KEY_TTL_SECS)
                .exec();
        }
        catch (err) {
            console.error("[presence] join write failed:", err?.message);
        }
        return full;
    },
    // ── Leave ─────────────────────────────────────────────────
    /** Returns the user who left (or null if this socket was in no room). */
    async leave(socketId) {
        const roomId = socketRoom.get(socketId) ?? null;
        if (!roomId)
            return { user: null, roomId: null };
        socketRoom.delete(socketId);
        const user = localRemove(roomId, socketId);
        try {
            await getRedis().hdel(roomKey(roomId), socketId);
        }
        catch (err) {
            console.error("[presence] leave write failed:", err?.message);
        }
        return { user, roomId };
    },
    // ── Queries ───────────────────────────────────────────────
    /** Every connected socket in the room, across all instances. */
    async getUsers(roomId) {
        try {
            const entries = await getRedis().hgetall(roomKey(roomId));
            return await pruneStale(roomId, entries);
        }
        catch (err) {
            console.error("[presence] getUsers failed, serving local view:", err?.message);
            return localUsers(roomId);
        }
    },
    /**
     * One entry per person — a user with two tabs open is still one participant.
     * `excludeUserId` drops the caller so they never see themselves in the roster.
     */
    async getPresence(roomId, excludeUserId) {
        const users = await RoomManager.getUsers(roomId);
        const byUser = new Map();
        for (const u of users) {
            if (u.userId === excludeUserId || byUser.has(u.userId))
                continue;
            byUser.set(u.userId, { id: u.userId, userId: u.userId, username: u.username, color: u.color });
        }
        return Array.from(byUser.values());
    },
    /** Distinct people in the room (not socket count). */
    async getUserCount(roomId) {
        const users = await RoomManager.getUsers(roomId);
        return new Set(users.map((u) => u.userId)).size;
    },
    /**
     * Is this user still in the room through any socket, anywhere?
     * `ignoreSocketId` lets a leave handler ask "…apart from the one that just left?".
     */
    async hasUser(roomId, userId, ignoreSocketId) {
        const users = await RoomManager.getUsers(roomId);
        return users.some((u) => u.userId === userId && u.socketId !== ignoreSocketId);
    },
    // ── Local, synchronous lookups (hot path — no Redis) ──────
    isInRoom(socketId, roomId) {
        return socketRoom.get(socketId) === roomId;
    },
    getRoomForSocket(socketId) {
        return socketRoom.get(socketId) ?? null;
    },
    /**
     * Connections to THIS instance in the room. Zero means this process has no
     * further reason to keep the room's document in memory.
     */
    localSocketCount(roomId) {
        return localRooms.get(roomId)?.size ?? 0;
    },
    // ── Purge (room deleted) ──────────────────────────────────
    /** Forget a room's local presence — no announcements; the room is gone. */
    purgeLocal(roomId) {
        const room = localRooms.get(roomId);
        if (room) {
            for (const socketId of room.keys())
                socketRoom.delete(socketId);
            localRooms.delete(roomId);
        }
    },
    /** Remove the shared roster for a deleted room. */
    async purgeShared(roomId) {
        try {
            await getRedis().del(roomKey(roomId));
        }
        catch (err) {
            console.error("[presence] purge failed:", err?.message);
        }
    },
    // ── Debug ─────────────────────────────────────────────────
    stats() {
        return { instanceId: INSTANCE_ID, rooms: localRooms.size, sockets: socketRoom.size };
    },
};
//# sourceMappingURL=roomManager.js.map