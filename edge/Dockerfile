# CodeVerse edge — builds the SPA, then serves it from Caddy alongside TLS
# termination and load balancing (see Caddyfile).
#
# Build context is the repository root so stage 1 can see web/.
# web/.env is excluded by the root .dockerignore: the production bundle must
# NOT carry VITE_API_URL / VITE_WS_URL — unset means "same origin", which is
# exactly what a single edge host wants.

# ── build the SPA ─────────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# `tsc -b` is a real typecheck (the bare `tsc` the script used to run was a no-op)
RUN npm run build

# ── serve ─────────────────────────────────────────────────
FROM caddy:2-alpine
COPY edge/Caddyfile /etc/caddy/Caddyfile
COPY --from=web /web/dist /srv
