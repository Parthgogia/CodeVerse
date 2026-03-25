import type { Request, Response } from "express";
import { exec } from "child_process";

export const runCode = async (req: Request, res: Response) => {
  const { code } = req.body;

  exec(`echo "${code}"`, (err, stdout, stderr) => {
    if (err) return res.json({ error: err.message });
    if (stderr) return res.json({ error: stderr });

    res.json({ output: stdout });
  });
};