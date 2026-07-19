import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

// GET /api/profile — returns the authenticated user's profile
router.get("/profile", (req: Request, res: Response) => {
  const authUser = req.user as AuthUser;
  const user = db.prepare("SELECT *, avatar_color as avatarColor FROM users WHERE id = ?").get(authUser.id) as any;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Strip sensitive fields
  const { password_hash, reset_token, reset_token_expires, ...safe } = user;
  res.json({ user: safe });
});

// PATCH /api/profile — update avatarColor for the authenticated user
router.patch("/profile", (req: Request, res: Response) => {
  const authUser = req.user as AuthUser;
  const { avatarColor } = req.body;

  if (avatarColor !== undefined && typeof avatarColor !== "string") {
    res.status(400).json({ error: "avatarColor must be a string" });
    return;
  }

  if (avatarColor !== undefined) {
    db.prepare("UPDATE users SET avatar_color = ? WHERE id = ?").run(avatarColor, authUser.id);
  }

  // Return updated profile
  const user = db.prepare("SELECT *, avatar_color as avatarColor FROM users WHERE id = ?").get(authUser.id) as any;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { password_hash, reset_token, reset_token_expires, ...safe } = user;
  res.json({ user: safe });
});

export default router;
