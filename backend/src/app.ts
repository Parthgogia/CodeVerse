import express from "express";
import cors from "cors";
import userRoutes from "./routes/user.routes.js";

export const app = express();

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use("/users", userRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});