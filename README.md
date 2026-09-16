# CodeVerse

Real-time collaborative code editor with live cursors, CRDT sync, Docker-sandboxed execution, persistent rooms, and a load-balanced multi-instance backend.

## Stack

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Frontend     | React + TypeScript, Monaco Editor, Yjs, Vite    |
| Realtime     | Socket.IO (Redis adapter), Yjs CRDT, cursor awareness |
| Backend API  | Express + TypeScript, JWT auth                  |
| Queue        | BullMQ + Redis                                  |
| Execution    | Docker (one throwaway container per run)        |
| Database     | PostgreSQL via Prisma ORM                       |
| Coordination | Redis (pub/sub, presence, save locks, rate limits, job queue) |
| Edge (prod)  | Caddy — TLS, static site, load balancer with health checks |

## Features

### Collaborative editing

- **Real-time co-editing** of one document by any number of people, powered by a Yjs CRDT.
  Every editor holds its own replica; edits merge deterministically with no locking, no
  "last write wins", and no lost keystrokes even when two people type in the same line.
- **Live cursors and selections** for everyone in the room, each in their own colour with
  a name label. Identity is stamped server-side, so nobody can impersonate another user's
  cursor.
- **Cheap on the wire.** Each keystroke sends only the CRDT diff for that change as a
  binary frame (about 27 bytes on a 2.5 KB file), not the whole document. If the server
  ever has to drop an update (rate limit), it tells the client when to resend its full
  state, so peers never end up stuck with a gap.
- **Monaco editor** (the VS Code editor) with syntax highlighting per language and
  `Ctrl+Enter` to run.

### Rooms

- **Create a room** with a name, description, language and visibility; it gets an 8-character
  code. **Join by code** from the dashboard.
- **Public or private.** Public rooms are open to any signed-in user who has the code;
  private rooms are owner-only. The rule is enforced in one place and applied to the REST
  API, the WebSocket join, and code execution alike — REST and realtime can never disagree.
- **Presence** — who's in the room, live. Joining and leaving is announced with toasts;
  a page refresh, a brief reconnect or opening a second tab does not produce phantom
  "left / joined" noise (3-second grace period, per-connection join, per-person leave).
- **Delete a room** (owner only) from the dashboard or from inside the room; everyone
  inside is notified and redirected, on every backend instance.

### Persistence

- **Rooms keep their code.** The document survives everyone leaving, a server restart,
  and being edited on two backend instances at once. What's stored is the binary CRDT
  state, so restores are exact and merges are idempotent.
- **Per-language code.** Each room holds a separate document per language. Switch from
  Python to JavaScript and you get JavaScript's own text (a starter template the first
  time); switch back and your Python is exactly as you left it.
- **Automatic saving** 4 seconds after the last edit, on the last person leaving, and on
  shutdown. Concurrent saves from different instances are merged under a lock, never
  overwritten.
- **History** — a plain-text snapshot is kept at most once a minute per room, plus one
  when the room empties (`GET /api/rooms/:id/snapshots`).

### Code execution

- **Run code in five languages** — JavaScript, TypeScript, Python, C++ and Java — with
  output streamed back to everyone in the room. Results arrive over the socket, with an
  HTTP polling fallback if the socket drops mid-run.
- **Every run is sandboxed** in its own throwaway Docker container: no network, read-only
  filesystem, a small tmpfs scratch space, and no host mounts (the code is piped in over
  stdin).
- **Resource limits that actually bite:** 10 s wall clock (the container is killed by
  name, not just the client), 256 MB memory (OOM-killed with a readable message), half a
  CPU, 64 processes (fork-bomb guard), a kernel CPU-seconds backstop for containers whose
  parent process died, a 64 KB output cap (the run is stopped, not the server), and a
  64 KB limit on submitted code. All tunable via `EXEC_*` environment variables.
- **Orphan reaper** — containers left behind by a crashed or restarted backend are swept
  up automatically, so an infinite loop can never pin a core forever.
- **Fair use:** 5 runs per 30 seconds per user; over that you get a `429` with a
  `Retry-After` telling you how long to wait.

### Accounts and security

- **Register / log in** with email and password (bcrypt-hashed), 7-day JWT sessions. The
  same token authenticates both REST calls and the WebSocket handshake.
- **Rate limiting** on every hot path — edits, cursor moves, room joins and code runs —
  per user, backed by Redis. Fails open if Redis blips, so a cache hiccup never stops
  editing.
- **Server-authoritative identity** for cursors and presence; clients cannot spoof
  another user.

### Scaling and operations

- **Horizontally scalable backend.** Any number of instances behind a load balancer:
  broadcasts fan out across instances over Redis pub/sub, presence and save locks live in
  Redis, and a job run by one instance's worker reaches users connected to another. No
  sticky sessions needed — the client is WebSocket-only.
- **Crash-safe presence.** Each instance heartbeats; if one dies, its ghost users are
  pruned within 30 s.
- **Production mode in one command** (`docker compose --profile prod up -d --build`): two
  backend containers, an edge container (Caddy) that terminates TLS, serves the built
  frontend and load-balances with active health checks, and a one-shot migration.
- **Real health checks.** `/health/live` ("is the process up?") and `/health/ready`
  ("should traffic come here?" — checks Postgres and Redis with timeouts). The load
  balancer only routes to instances that are ready.
- **Graceful draining.** Stopping an instance first pulls it out of rotation, then closes
  connections, then flushes every open document — users on it reconnect to another
  instance and keep editing. No edits lost, no ghost presence.
- **Every response carries `X-Instance-Id`**, so you can see which instance served you.

## Project structure

```
/
├── backend/
│   ├── src/
│   │   ├── config/          redis.ts
│   │   ├── controllers/     auth, room, exec
│   │   ├── middleware/       auth JWT guard
│   │   ├── queues/           execQueue (BullMQ), dockerRunner (sandbox + limits + reaper)
│   │   ├── realtime/
│   │   │   ├── handlers/    room, code, cursor
│   │   │   ├── roomDocs     server-side Y.Doc + persistence
│   │   │   ├── roomManager  Redis-backed presence
│   │   │   ├── rateLimiter  Redis INCR+EXPIRE
│   │   │   └── socket.ts    Socket.IO server + auth + Redis adapter
│   │   ├── routes/          auth, room, exec, health
│   │   ├── services/        roomAccess (authorization), health (live/ready/draining)
│   │   └── server.ts        HTTP + Socket.IO entrypoint
│   ├── prisma/
│   │   └── schema.prisma
│   ├── sandbox/             typescript.Dockerfile — the TypeScript runner image
│   ├── Dockerfile           backend image (prod mode)
│   ├── .env.example         backend settings (dev mode)
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── components/      Button, Input, Modal, Navbar, Plasma
│   │   ├── contexts/        AuthContext, ToastContext
│   │   ├── lib/             api, socket, auth, useYjsEditor,
│   │   │                    useJobPoller, monacoTheme
│   │   ├── pages/           Landing, Auth, Dashboard, Editor
│   │   └── types/           index.ts (all shared types)
│   ├── .env                 VITE_API_URL / VITE_WS_URL (dev only; unset = same origin)
│   ├── package.json
│   └── vite.config.ts
├── edge/
│   ├── Caddyfile            HTTPS, static site, load balancer (prod mode)
│   └── Dockerfile           builds the web bundle, serves it from Caddy
├── docker-compose.yml       dev: Postgres + Redis · prod (--profile prod): everything
└── .env.example             root settings for prod mode (JWT_SECRET, PUBLIC_HOST)
```

## Running CodeVerse

There are **two ways** to run it. Pick one — don't run both at the same time.

| | **Dev mode** | **Prod mode** |
|---|---|---|
| Who it's for | writing code, day-to-day | seeing the real deployment shape |
| Postgres + Redis | Docker | Docker |
| Backend | your machine, `npm run dev`, port 4000, hot reload | Docker, **two** containers, no ports exposed |
| Frontend | your machine, Vite, port 5173 | built once, served by the edge container |
| Address | http://localhost:5173 | **https://localhost** |
| HTTPS / load balancer / health checks | no | yes (Caddy "edge" container) |
| Start | 3 terminals | 1 command |

Both modes share the same Postgres and Redis, so the same users and rooms exist in both.

### Prerequisites (both modes)

- **Docker Desktop**, running. Dev mode needs it for Postgres, Redis and to sandbox code
  runs; prod mode runs everything in it.
- **Node.js 20+** and npm — dev mode only.

### Dev mode, step by step

Three things run in three terminals.

**Terminal 1 — databases (Docker):**

```bash
docker compose up -d
```

Starts Postgres on `localhost:5432` and Redis on `localhost:6379`. Nothing else.

**Terminal 2 — backend (your machine):**

```bash
cd backend
npm install
cp .env.example .env      # first time only — DATABASE_URL and JWT_SECRET are required
npm run db:generate       # first time, and after any prisma/schema.prisma change
npm run db:push           # first time, and after any schema change (or: npx prisma migrate dev)
npm run sandbox:build     # first time only — builds the TypeScript runner image
npm run dev               # http://localhost:4000, hot reload
```

**Terminal 3 — frontend (your machine):**

```bash
cd web
npm install
npm run dev               # http://localhost:5173
```

Open **http://localhost:5173**. Vite proxies `/api` and `/socket.io` to the backend, so
there are no CORS issues. When you click **Run**, the backend on your machine starts a
throwaway Docker container for the code.

**To stop dev mode:** `Ctrl+C` in terminals 2 and 3, then `docker compose down` (or leave
the databases running — they cost nothing).

### Prod mode, step by step

Everything runs in Docker. Nothing runs on your machine directly.

```bash
# 1. first time only: settings for the containers
cp .env.example .env
#    edit .env → set JWT_SECRET to any long random string (PUBLIC_HOST stays localhost)

# 2. build the images and start everything
docker compose --profile prod up -d --build

# 3. check
docker compose --profile prod ps                # backend-1 and backend-2 should say "healthy"
curl -k https://localhost/health/ready          # {"status":"ok", ..., "checks":{"postgres":"ok","redis":"ok",...}}
```

Open **https://localhost**. The certificate is self-signed, so the browser warns once —
click through, or trust Caddy's local CA permanently with
`docker compose exec edge caddy trust`.

What is running, and what each container does:

| Container | Runs | Then |
|---|---|---|
| `postgres`, `redis` | the databases | stay up |
| `migrate` | `prisma migrate deploy` (applies DB migrations) | exits — that's normal |
| `sandbox-ts` | builds the `codeverse-sandbox-ts` image | exits — that's normal |
| `backend-1`, `backend-2` | two identical backends (API + sockets + worker) | stay up; **no ports exposed** |
| `edge` | Caddy: HTTPS on 443, serves the website, sends `/api` + `/socket.io` to whichever backend is healthy | stays up |

`docker compose --profile prod ps` shows `migrate` and `sandbox-ts` as exited — expected.

**To stop prod mode:**

```bash
docker compose --profile prod down      # stops and removes the containers; data volumes are kept
```

**After changing backend or web code** in prod mode, rebuild:
`docker compose --profile prod up -d --build`. (Dev mode hot-reloads instead.)

### Things that trip people up

- **`--profile prod` is the switch.** Without it, compose only knows about Postgres and
  Redis. With it, it knows about the whole stack. Use it on every command in prod mode:
  `up`, `ps`, `logs`, `stop`, `down`.
- **Two `.env` files, two jobs.** `backend/.env` is read by the backend when *you* run it
  (dev mode). The **root** `.env` is read by docker compose for the containers (prod mode).
  They don't see each other.
- **"Failed to start Docker"** on every run → Docker Desktop isn't running.
- **TypeScript runs fail with "Unable to find image"** → the runner image was never built
  on this machine: `cd backend && npm run sandbox:build` (dev) or `--build` (prod).
- **Port 4000 already in use** in dev mode → a previous `npm run dev` is still alive
  (`tsx watch` survives crashes). Find it with
  `Get-NetTCPConnection -LocalPort 4000` (PowerShell) and stop that PID.
- **Prod mode and `npm run dev` at the same time** works technically (the containers
  publish no ports), but they share the database — keep it simple and pick one.

## Environment variables

### backend/.env

| Variable         | Default                                           | Required |
|------------------|---------------------------------------------------|----------|
| `DATABASE_URL`   | `postgresql://postgres:password@localhost:5432/codeverse` | ✅ |
| `JWT_SECRET`     | —                                                 | ✅       |
| `REDIS_HOST`     | `localhost`                                       |          |
| `REDIS_PORT`     | `6379`                                            |          |
| `PORT`           | `4000`                                            |          |
| `CLIENT_ORIGIN`  | `http://localhost:5173`                           |          |
| `EXEC_TIMEOUT_MS` | `10000` — wall-clock limit per run              |          |
| `EXEC_MEMORY_MB` | `256` — container memory cap (OOM-killed above)   |          |
| `EXEC_CPUS`      | `0.5` — share of one core per run                 |          |
| `EXEC_PIDS`      | `64` — process cap (fork-bomb guard)              |          |
| `EXEC_TMPFS_MB`  | `32` — writable scratch space                     |          |
| `EXEC_MAX_OUTPUT_BYTES` | `65536` — stdout+stderr cap; run is stopped past it |   |
| `EXEC_MAX_CODE_BYTES`   | `65536` — submitted code cap (`413` above it)  |          |
| `SHUTDOWN_DRAIN_MS` | `4000` — how long `/health/ready` says 503 before sockets close |   |

### .env (repository root — `prod` profile only)

| Variable | Default | Required |
|----------|---------|----------|
| `JWT_SECRET` | — | ✅ |
| `PUBLIC_HOST` | `localhost` | |

### web/.env

| Variable        | Default                   |
|-----------------|---------------------------|
| `VITE_API_URL`  | `http://localhost:4000`   |
| `VITE_WS_URL`   | `http://localhost:4000`   |

## Socket events reference

| Direction        | Event              | Payload                                        |
|------------------|--------------------|------------------------------------------------|
| Client → Server  | `room:join`        | `{ roomId }`                                   |
| Client → Server  | `room:leave`       | `{ roomId }`                                   |
| Client → Server  | `yjs:update`       | `{ roomId, update: <binary> }` incremental diff; acked `{ ok }` or `{ ok:false, reason, retryAfterMs }` |
| Client → Server  | `yjs:awareness`    | `{ roomId, state: AwarenessState }`            |
| Client → Server  | `code:change`      | `{ roomId, content }` (plain-text fallback)    |
| Server → Client  | `room:state`       | `{ code, doc: <binary>, users, language }`     |
| Server → Client  | `room:user-joined` | `{ id, userId, username, color }`              |
| Server → Client  | `room:user-left`   | `{ userId, username }`                         |
| Server → Client  | `yjs:update`       | `{ update: <binary> }` (relayed diff)          |
| Server → Client  | `yjs:awareness`    | `AwarenessState` (relayed cursor)              |
| Server → Client  | `code:run-result`  | `{ stdout, stderr, exitCode, executionTimeMs }`|
| Server → Client  | `room:deleted`     | `{ roomId, name }` (owner deleted the room)    |
| Server → Client  | `error`            | `string`                                       |

## API endpoints

```
POST   /api/auth/register        { username, email, password }
POST   /api/auth/login           { email, password }
GET    /api/auth/me              Bearer token → user

GET    /api/rooms                list owned rooms
POST   /api/rooms                create room
GET    /api/rooms/:id            get room
PATCH  /api/rooms/:id            update room
DELETE /api/rooms/:id            delete room
GET    /api/rooms/:id/snapshots  last 20 code snapshots
DELETE /api/rooms/:id            delete room (owner only)

POST   /api/execute              { roomId, code, language } → { jobId }
                                 413 if code > 64 KB · 429 + Retry-After if > 5 runs / 30 s
GET    /api/execute/:jobId       poll job status (not rate limited)

GET    /health/live              200 always — process is up
GET    /health/ready             200 if Postgres + Redis answer and not draining, else 503 with per-check detail
GET    /api/health               alias of /health/ready
```

Every response carries an `X-Instance-Id` header.

## Persistence

Rooms keep their code. The server holds its own `Y.Doc` for every active room
(`realtime/roomDocs.ts`), folds each relayed `yjs:update` into it, and writes it
back to Postgres — 4 s after the last edit, when the last person leaves, and on
shutdown.

What is stored is the **binary Yjs state** (`Room.docState`), not text. That
matters: rebuilding a document by inserting a plain string creates fresh CRDT
operations, so two instances restoring the same room from text would merge into
duplicated code. Restoring from identical bytes reproduces identical history, and
merges are idempotent.

`room:state` therefore carries `doc` — the state a returning client applies
directly — alongside `code` as a plain-text fallback for the current language.

**Each language has its own text.** The `Y.Doc` holds one `Y.Text` per language
(`code:python`, `code:javascript`, …). Switching language rebinds the editor to a
different text; the previous language's code stays exactly where it was and comes
back when you switch back. A language nobody has written in yet gets its starter
template the first time someone opens or switches to it.

Concurrent saves are safe without instances gossiping to each other: each save
takes a short Redis lock, merges whatever is already stored into its own document,
and writes the union. A save can never shrink the stored document, whichever
instance wins the race.

`Snapshot` rows remain the human-readable history behind
`GET /api/rooms/:id/snapshots` — written at most once a minute per room, plus one
final row when the room empties.

## Deleting a room

Owners can delete a room from the dashboard card menu or from the room itself
(the ⋮ menu beside **Run**), both behind a confirmation dialog. `DELETE /api/rooms/:id`
is owner-only; anyone else gets a `403`. On success the room is torn down across
the cluster: everyone still inside receives `room:deleted` and is returned to their
dashboard, the Socket.IO room is emptied, the shared roster is dropped, and every
instance forgets its cached document. Snapshots cascade with the row.

## Access control

| Room visibility | Who can open it                        |
|-----------------|----------------------------------------|
| Public          | any signed-in user with the room code  |
| Private         | the owner only                         |

The rules live in one place — `services/roomAccess.ts` — and are applied by
`GET /api/rooms/:id`, `GET /api/rooms/:id/snapshots`, `POST /api/execute` and the
socket `room:join` handler, so REST and realtime can never disagree. `PATCH` and
`DELETE` remain owner-only. A refused join answers with a `403` (REST) or an
`error` event (socket) — never a room payload.

## How prod mode works: TLS, load balancer, health checks

(How to *run* it is under [Running CodeVerse](#running-codeverse).) The **edge**
container (Caddy, `edge/Caddyfile`) on https://localhost:

- terminates TLS (`tls internal` → a local CA; browsers warn until you trust it —
  `docker compose exec edge caddy trust` prints the root cert; set `PUBLIC_HOST` to a real
  domain and drop `tls internal` in `edge/Caddyfile` for automatic Let's Encrypt),
- serves the built SPA (same origin, so the bundle needs no `VITE_*` URLs),
- load-balances `/api`, `/socket.io` and `/health` across the backends, probing
  `/health/ready` every 3 s so only ready instances receive traffic.

Backends publish no ports; the edge is the only entry. `docker compose stop backend-1`
drains it: readiness goes 503, the edge stops routing to it within a probe, sockets
close after 4 s, documents are flushed, and clients reconnect to the other instance.
Backends talk to the host Docker daemon through `/var/run/docker.sock` to run code —
root-equivalent on the host, same as running the backend directly.

Health endpoints (see [API endpoints](#api-endpoints)): `/health/live` says "the process
is up"; `/health/ready` says "send me traffic" and is what the edge probes.

## Running more than one instance

Presence and broadcasts are shared through Redis, so instances are interchangeable
behind a load balancer (the `prod` profile above runs two):

```bash
PORT=4000 npm run dev
PORT=4001 npm run dev   # same DATABASE_URL, same Redis
```

- **Broadcasts** — `@socket.io/redis-adapter` fans every `io.to(room)` emit across
  processes, so edits, cursors, language changes and run results reach the whole
  room regardless of which instance a user is connected to (or which instance's
  BullMQ worker executed the job).
- **Presence** — the room roster lives in a Redis hash (`presence:room:{roomId}`),
  so `activeUsers` and `room:state` aggregate every instance. The
  `socketId → roomId` lookup on the per-keystroke path stays in process memory, so
  hot events cost no extra round-trip.
- **Crash safety** — each instance refreshes `presence:instance:{id}` with a 30 s
  TTL and stamps its entries. Entries from an instance whose heartbeat has lapsed
  are pruned on the next read, so a killed process leaves no ghost users behind.
  A graceful shutdown removes its own entries immediately.

## Presence notifications

`room:user-joined` fires once per arriving *connection* (peers use it to push their
Yjs state to the newcomer); the client suppresses the toast for anyone already in
its roster. `room:user-left` is held for a 3-second grace period and dropped
entirely if the person comes back — so a page refresh, a brief reconnect or a React
re-mount no longer makes the room flash "X left / X joined".

## Supported languages

| Language   | Runtime image      | Command |
|------------|--------------------|---------|
| JavaScript | node:20-alpine     | `node main.js` |
| TypeScript | codeverse-sandbox-ts (local build, `backend/sandbox/typescript.Dockerfile`) | `tsx main.ts` — types stripped, not checked |
| Python     | python:3.12-alpine | `python main.py` |
| C++        | gcc:13             | `g++ … && ./main` |
| Java       | eclipse-temurin:21-alpine    | `javac Main.java && java Main` |

The sandbox has no network, so every toolchain must already be in its image. The four
public images are pulled on first use; the TypeScript image must be built once with
`npm run sandbox:build` (from `backend/`).

## How code execution works

1. User clicks **Run** (or Ctrl+Enter)
2. Frontend `POST /api/execute` → backend checks code size (`413`), the per-user rate limit (`429` + `Retry-After`), then room access, then enqueues a BullMQ job and returns `jobId`
3. BullMQ worker picks up the job, calls `dockerRunner.ts`
4. `dockerRunner` pipes the code over stdin into a fresh, named container (`cat > /tmp/main.py && python /tmp/main.py`): `--network none --memory 256m --cpus 0.5 --pids-limit 64 --ulimit cpu=10:12 --read-only`
5. Limits, all tunable via `EXEC_*` env vars: 10 s wall clock (container is removed by name), 256 MB memory (OOM-killed), 64 KB output (run is stopped), 64 KB code (`413`). A reaper sweeps containers orphaned by a worker restart.
6. Result `{ stdout, stderr, exitCode, executionTimeMs }` emitted to the entire Socket.IO room via `io.to(roomId).emit('code:run-result', result)`. A limit that fired is explained in `stderr`: exit 124 = timed out, 137 = memory limit, 152 = CPU-time limit, 1 with "Output limit exceeded" = output cap
7. Frontend socket handler receives result, cancels HTTP poller, updates output panel

## How real-time sync works

1. User joins a room → server sends `room:state` with the persisted Yjs state (`doc`, binary) and the current language
2. The client binds the editor to that language's `Y.Text` and applies `doc`
3. Every Monaco `onDidChangeModelContent` event is transacted into the `Y.Doc` with origin `'local'`; the resulting **incremental** update (tens of bytes, not the whole document) is emitted as a binary `yjs:update`
4. Server acks it and relays the bytes to all other clients in the room. If the update was rate-limited, the ack says when the window resets and the client resends its full state once, just after — so a dropped diff never leaves peers with a gap
5. Recipients apply the update via `Y.applyUpdate()` with origin `'remote'` (never re-sent), which syncs Monaco
6. Cursor positions + selections are broadcast as `yjs:awareness` events and rendered as Monaco decorations with per-user colors

## Rate limits (Redis)

| Event       | Limit           |
|-------------|-----------------|
| code:change | 120 / 10 s      |
| yjs:update  | 200 / 10 s      |
| cursor:move | 300 / 10 s      |
| code run    | 5 / 30 s (HTTP 429 + `Retry-After`) |
| room join   | 10 / 30 s       |