import * as Y from "yjs";
import { prisma }   from "../config/db.js";
import { getRedis } from "../config/redis.js";
import { INSTANCE_ID } from "./roomManager.js";

// ─────────────────────────────────────────────────────────────────────────────
// RoomDocs — the server's own copy of each room's document.
//
// Before this existed the server only relayed Yjs updates and never read them,
// so nothing was ever written back to Postgres and every room came back empty.
// Now each active room gets a Y.Doc here: updates are applied as they are
// relayed, and the document is written back as a binary CRDT state.
//
// Why binary and not text: rebuilding a Y.Doc by inserting a plain string
// produces *new* CRDT operations. Two instances doing that independently would
// merge into duplicated text. Restoring from the exact same bytes gives every
// instance an identical operation history, so merges are idempotent.
//
// Multi-instance safety: instances do not gossip updates to each other — the
// database is the merge point. Every save takes a short Redis lock, merges
// whatever is already stored into the local document, and writes the union
// back. A save can therefore never shrink the stored document, no matter which
// instance wins the race or how far behind it was.
// ─────────────────────────────────────────────────────────────────────────────

interface RoomDoc {
  ydoc:            Y.Doc;
  ytext:           Y.Text;
  dirty:           boolean;
  saveTimer:       ReturnType<typeof setTimeout> | null;
  lastSnapshotText: string;
  lastSnapshotAt:  number;
}

const docs    = new Map<string, RoomDoc>();
const loading = new Map<string, Promise<RoomDoc>>();

/** Quiet period after the last edit before the document is written back. */
const SAVE_DEBOUNCE_MS = 4_000;
/** Floor between two history rows for one room, so typing can't flood the table. */
const SNAPSHOT_MIN_INTERVAL_MS = 60_000;
const SAVE_LOCK_TTL_SECS = 10;
const SAVE_RETRY_MS      = 1_500;
/** A final flush can't be deferred to "later" — there may be no later. */
const FINAL_LOCK_ATTEMPTS = 25;
const FINAL_LOCK_DELAY_MS = 200;

const saveLockKey = (roomId: string) => `docsave:${roomId}`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Take the room's save lock. A normal save tries once and reschedules if it
 * loses; a final save (last user left, or shutdown) keeps trying, because
 * giving up would silently drop the edits it was called to write out.
 */
async function acquireSaveLock(roomId: string, final: boolean): Promise<boolean> {
  const redis    = getRedis();
  const attempts = final ? FINAL_LOCK_ATTEMPTS : 1;

  for (let i = 0; i < attempts; i++) {
    const res = await redis
      .set(saveLockKey(roomId), INSTANCE_ID, "EX", SAVE_LOCK_TTL_SECS, "NX")
      .catch(() => "OK");          // Redis down → fall back to single-instance behaviour
    if (res === "OK") return true;
    if (i < attempts - 1) await sleep(FINAL_LOCK_DELAY_MS);
  }
  return false;
}

// ── Load / cache ──────────────────────────────────────────
async function load(roomId: string): Promise<RoomDoc> {
  const cached = docs.get(roomId);
  if (cached) return cached;

  const inflight = loading.get(roomId);
  if (inflight) return inflight;

  const promise = (async (): Promise<RoomDoc> => {
    let stored: Uint8Array | null = null;
    try {
      const row = await prisma.room.findUnique({
        where:  { id: roomId },
        select: { docState: true },
      });
      if (row?.docState?.length) stored = new Uint8Array(row.docState);
    } catch (err: any) {
      console.error(`[docs] Failed to load ${roomId}:`, err?.message);
    }

    const ydoc = new Y.Doc();
    if (stored) Y.applyUpdate(ydoc, stored);
    const ytext = ydoc.getText("code");

    const doc: RoomDoc = {
      ydoc,
      ytext,
      dirty:            false,
      saveTimer:        null,
      lastSnapshotText: ytext.toString(),
      lastSnapshotAt:   Date.now(),
    };

    docs.set(roomId, doc);
    loading.delete(roomId);
    return doc;
  })();

  loading.set(roomId, promise);
  return promise;
}

// ── Save ──────────────────────────────────────────────────
function scheduleSave(roomId: string, doc: RoomDoc, delay = SAVE_DEBOUNCE_MS): void {
  if (doc.saveTimer) clearTimeout(doc.saveTimer);
  doc.saveTimer = setTimeout(() => {
    doc.saveTimer = null;
    void persist(roomId, doc, false);
  }, delay);
  doc.saveTimer.unref?.();
}

/** Is a new history row due for this text? */
function snapshotDue(doc: RoomDoc, text: string, final: boolean): boolean {
  if (!text.trim() || text === doc.lastSnapshotText) return false;
  return final || Date.now() - doc.lastSnapshotAt >= SNAPSHOT_MIN_INTERVAL_MS;
}

async function persist(roomId: string, doc: RoomDoc, final: boolean): Promise<boolean> {
  // `dirty` only tracks the CRDT state. The history row can still be owed even
  // when the state is already saved — a debounced save clears `dirty` but is
  // rate-limited out of writing a snapshot, and the final flush must catch up.
  if (!doc.dirty && !snapshotDue(doc, doc.ytext.toString(), final)) return true;

  let holdsLock = false;

  try {
    holdsLock = await acquireSaveLock(roomId, final);
    if (!holdsLock) {
      console.warn(`[docs] Could not take the save lock for ${roomId}${final ? " (final flush)" : ""}`);
      if (!final) scheduleSave(roomId, doc, SAVE_RETRY_MS);
      return false;
    }

    // Merge in whatever another instance stored while we were editing, so the
    // write is a union rather than an overwrite. This is what makes the order
    // of concurrent saves irrelevant: a save can never shrink the document.
    const row = await prisma.room.findUnique({
      where:  { id: roomId },
      select: { docState: true },
    });
    if (row === null) {             // room deleted underneath us
      forget(roomId);
      return true;
    }
    if (row.docState?.length) Y.applyUpdate(doc.ydoc, new Uint8Array(row.docState));

    // Recompute after the merge — the union may differ from what we had.
    const state = Y.encodeStateAsUpdate(doc.ydoc);
    const text  = doc.ytext.toString();

    await prisma.room.update({
      where: { id: roomId },
      data:  { docState: Buffer.from(state) },
    });
    doc.dirty = false;

    // Human-readable history for GET /api/rooms/:id/snapshots.
    if (snapshotDue(doc, text, final)) {
      await prisma.snapshot.create({ data: { roomId, content: text } });
      doc.lastSnapshotText = text;
      doc.lastSnapshotAt   = Date.now();
      console.log(`[docs] Snapshot saved for ${roomId} (${text.length} chars)`);
    }
    return true;
  } catch (err: any) {
    if (err?.code === "P2025") {    // record not found — room was deleted
      forget(roomId);
      return true;
    }
    console.error(`[docs] Failed to persist ${roomId}:`, err?.message);
    if (!final) scheduleSave(roomId, doc, SAVE_RETRY_MS);
    return false;
  } finally {
    if (holdsLock) {
      await getRedis().del(saveLockKey(roomId)).catch(() => {});
    }
  }
}

// ── Public API ────────────────────────────────────────────
export const RoomDocs = {
  /** Warm the document so a joining client gets its state without a stall. */
  async prepare(roomId: string): Promise<void> {
    await load(roomId);
  },

  /** Fold a client's Yjs update into the room's document and queue a save. */
  async applyUpdate(roomId: string, update: Uint8Array): Promise<void> {
    const doc = docs.get(roomId) ?? await load(roomId);
    try {
      Y.applyUpdate(doc.ydoc, update);
    } catch (err: any) {
      console.error(`[docs] Rejected malformed update for ${roomId}:`, err?.message);
      return;
    }
    doc.dirty = true;
    scheduleSave(roomId, doc);
  },

  /** The room's current state, as bytes a client can Y.applyUpdate directly. */
  async getState(roomId: string): Promise<Uint8Array> {
    const doc = await load(roomId);
    return Y.encodeStateAsUpdate(doc.ydoc);
  },

  /** Plain text of the document — used for the room:state text fallback. */
  async getText(roomId: string): Promise<string> {
    const doc = await load(roomId);
    return doc.ytext.toString();
  },

  /** Last local participant left: write the document out and free the memory. */
  async release(roomId: string): Promise<void> {
    const doc = docs.get(roomId);
    if (!doc) return;
    if (doc.saveTimer) { clearTimeout(doc.saveTimer); doc.saveTimer = null; }

    const saved = await persist(roomId, doc, true);
    if (!saved) {
      // Keep it in memory rather than discarding unsaved work; the next join
      // or the shutdown flush gets another chance at it.
      console.error(`[docs] Keeping ${roomId} in memory — final save did not complete`);
      return;
    }
    docs.delete(roomId);
  },

  /** Drop without saving — the room no longer exists. */
  forget(roomId: string): void {
    forget(roomId);
  },

  /** Flush every open document (graceful shutdown). */
  async flushAll(): Promise<void> {
    const open = [...docs.keys()];
    await Promise.all(open.map((roomId) => RoomDocs.release(roomId)));
    if (open.length) console.log(`[docs] Flushed ${open.length} document(s) on shutdown`);
  },

  stats(): { open: number } {
    return { open: docs.size };
  },
};

function forget(roomId: string): void {
  const doc = docs.get(roomId);
  if (doc?.saveTimer) clearTimeout(doc.saveTimer);
  docs.delete(roomId);
  loading.delete(roomId);
}
