# CodeVerse backend — API + Socket.IO + BullMQ worker in one process.
#
# Built from source (not the committed dist/) so the image is reproducible.
# The runtime stage carries the docker CLI only: it drives the HOST daemon
# through /var/run/docker.sock, which compose mounts. That is root-equivalent
# on the host — the same trust a host-run backend already had — so this image
# runs as root rather than pretending otherwise; the sandbox containers it
# launches are unaffected and keep every limit in dockerRunner.ts.

# ── build ─────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
# native module fallback (bcrypt) + openssl for the prisma engine
RUN apk add --no-cache python3 make g++ openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── runtime ───────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache docker-cli openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY --from=build /app/prisma       ./prisma
COPY package.json ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
