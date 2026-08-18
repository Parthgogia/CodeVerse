# CodeVerse

Real-time collaborative code editor with live cursors, CRDT sync, Docker-sandboxed execution, and auto-scaled workers.

## Stack

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Frontend     | React + TypeScript, Monaco Editor, Yjs, Vite    |
| Realtime     | Socket.IO, Yjs CRDT, awareness protocol         |
| Backend API  | Express + TypeScript, JWT auth                  |
| Queue        | BullMQ + Redis                                  |
| Execution    | Docker (one container per run)                  |
| Database     | PostgreSQL via Prisma ORM                       |
| State cache  | Redis (rate limiting, BullMQ)                   |

## Project structure

```
/
├── backend/
│   ├── src/
│   │   ├── config/          redis.ts
│   │   ├── controllers/     auth, room, exec
│   │   ├── middleware/       auth JWT guard
│   │   ├── queues/           execQueue (BullMQ), dockerRunner
│   │   ├── realtime/
│   │   │   ├── handlers/    room, code, cursor
│   │   │   ├── roomDocs     server-side Y.Doc + persistence
│   │   │   ├── roomManager  Redis-backed presence
│   │   │   ├── rateLimiter  Redis INCR+EXPIRE
│   │   │   └── socket.ts    Socket.IO server + auth + Redis adapter
│   │   ├── routes/          auth, room, exec
│   │   ├── services/        roomAccess (room authorization)
│   │   └── server.ts        HTTP + Socket.IO entrypoint
│   ├── prisma/
│   │   └── schema.prisma
│   ├── .env.example
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
│   ├── .env
│   ├── package.json
│   └── vite.config.ts
└── docker-compose.yml       Postgres + Redis for local dev
```

## Prerequisites

- Node.js 20+
- Docker Desktop (running — required for code execution)
- pnpm / npm / yarn

## Setup

### 1. Start Postgres + Redis

```bash
docker compose up -d
```

Postgres is available at `localhost:5432`, Redis at `localhost:6379`.

### 2. Backend

```bash
cd backend

# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env — DATABASE_URL and JWT_SECRET are required

# Generate Prisma client + push schema to DB
npm run db:generate
npm run db:push

# Start dev server (tsx watch — hot reload)
npm run dev
```

Backend listens on **http://localhost:4000**.

### 3. Frontend

```bash
cd web

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

Frontend runs on **http://localhost:5173**. All `/api` and `/socket.io` requests are proxied to `:4000` via `vite.config.ts` — no CORS issues in development.

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
| Client → Server  | `yjs:update`       | `{ roomId, update: number[] }` (binary diff)   |
| Client → Server  | `yjs:awareness`    | `{ roomId, state: AwarenessState }`            |
| Client → Server  | `code:change`      | `{ roomId, content }` (plain-text fallback)    |
| Server → Client  | `room:state`       | `{ code, doc: number[], users, language }`     |
| Server → Client  | `room:user-joined` | `{ id, userId, username, color }`              |
| Server → Client  | `room:user-left`   | `{ userId, username }`                         |
| Server → Client  | `yjs:update`       | `{ update: number[] }` (relayed diff)          |
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
GET    /api/execute/:jobId       poll job status
```

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
directly — alongside `code` as a plain-text fallback. A brand-new empty room gets
its starter template from the first person to open it.

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

## Running more than one instance

Presence and broadcasts are shared through Redis, so instances are interchangeable
behind a load balancer:

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

| Language   | Runtime image      |
|------------|--------------------|
| JavaScript | node:20-alpine     |
| TypeScript | node:20-alpine     |
| Python     | python:3.12-alpine |
| C++        | gcc:13             |
| Java       | eclipse-temurin:21-alpine    |

## How code execution works

1. User clicks **Run** (or Ctrl+Enter)
2. Frontend `POST /api/execute` → backend enqueues a BullMQ job, returns `jobId`
3. BullMQ worker picks up the job, calls `dockerRunner.ts`
4. `dockerRunner` mounts code into a fresh container: `--network none --memory 256m --cpus 0.5 --pids-limit 64 --read-only`
5. Hard timeout of 10 seconds enforced by `setTimeout` + `SIGKILL`
6. Result emitted back to the entire Socket.IO room via `io.to(roomId).emit('code:run-result', result)`
7. Frontend socket handler receives result, cancels HTTP poller, updates output panel

## How real-time sync works

1. User joins a room → server sends `room:state` with latest snapshot code
2. `initializeCode()` seeds the local `Y.Doc` with that code
3. Every Monaco `onDidChangeModelContent` event is transacted into the `Y.Doc`, encoded as a binary Yjs update, and emitted as `yjs:update`
4. Server relays the binary diff to all other clients in the room
5. Recipients apply the update via `Y.applyUpdate()`, which syncs Monaco
6. Cursor positions + selections are broadcast as `yjs:awareness` events and rendered as Monaco decorations with per-user colors

## Rate limits (Redis)

| Event       | Limit           |
|-------------|-----------------|
| code:change | 120 / 10 s      |
| yjs:update  | 200 / 10 s      |
| cursor:move | 300 / 10 s      |
| code run    | 5 / 30 s        |
| room join   | 10 / 30 s       |