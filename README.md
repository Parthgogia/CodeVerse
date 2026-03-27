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
│   │   │   ├── roomManager  in-memory presence
│   │   │   ├── rateLimiter  Redis INCR+EXPIRE
│   │   │   └── socket.ts    Socket.IO server + auth
│   │   ├── routes/          auth, room, exec
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
| `DATABASE_URL`   | `postgresql://postgres:password@localhost:5432/codesync` | ✅ |
| `JWT_SECRET`     | —                                                 | ✅       |
| `REDIS_HOST`     | `localhost`                                       |          |
| `REDIS_PORT`     | `6379`                                            |          |
| `REDIS_PASSWORD` | —                                                 |          |
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
| Server → Client  | `room:state`       | `{ code, users: ConnectedUser[] }`             |
| Server → Client  | `room:user-joined` | `{ id, userId, username, color }`              |
| Server → Client  | `room:user-left`   | `{ userId, username }`                         |
| Server → Client  | `yjs:update`       | `{ update: number[] }` (relayed diff)          |
| Server → Client  | `yjs:awareness`    | `AwarenessState` (relayed cursor)              |
| Server → Client  | `code:run-result`  | `{ stdout, stderr, exitCode, executionTimeMs }`|
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

POST   /api/execute              { roomId, code, language } → { jobId }
GET    /api/execute/:jobId       poll job status
```

## Supported languages

| Language   | Runtime image      |
|------------|--------------------|
| JavaScript | node:20-alpine     |
| TypeScript | node:20-alpine     |
| Python     | python:3.12-alpine |
| C++        | gcc:13             |
| Java       | openjdk:21-slim    |

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