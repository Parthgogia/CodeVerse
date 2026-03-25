import http from "http";
import { Server } from "socket.io";
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("join-room", (roomId: string) => {
    socket.join(roomId);
  });

  socket.on("code-change", ({ roomId, update }) => {
    socket.to(roomId).emit("code-change", update);
  });

  socket.on("cursor-move", ({ roomId, cursor }) => {
    socket.to(roomId).emit("cursor-move", {
      socketId: socket.id,
      cursor,
    });
  });
});

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});