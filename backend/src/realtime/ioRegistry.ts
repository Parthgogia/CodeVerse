import type { Server } from "socket.io";

// The Socket.IO server, published for code that isn't part of the socket stack
// (REST controllers, mainly) so it can broadcast without importing socket.ts —
// which would pull the whole handler graph in and create an import cycle.

let server: Server | null = null;

export function setIo(io: Server): void {
  server = io;
}

export function getIo(): Server | null {
  return server;
}
