import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || "medchron-admin";

// POST /api/admin/grant-premium
// Grants premium to a user by email. Requires admin secret.
router.post("/admin/grant-premium", (req: Request, res: Response) => {
  // Check secret — can be in query param or body
  const secret = (req.query.secret as string) || req.body?.secret;
  if (!secret || secret !== ADMIN_SECRET) {
    res.status(403).json({ error: "Forbidden: invalid admin secret" });
    return;
  }

  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare("SELECT id, email, is_premium FROM users WHERE email = ?").get(normalizedEmail) as any;

  if (!user) {
    res.status(404).json({ error: "User not found. They must sign up first." });
    return;
  }

  const premiumSince = new Date().toISOString();

  db.prepare("UPDATE users SET is_premium = 1, premium_since = ? WHERE id = ?")
    .run(premiumSince, user.id);

  const updated = db.prepare("SELECT id, email, is_premium, premium_since FROM users WHERE id = ?")
    .get(user.id) as any;

  res.json({
    message: `Premium granted to ${updated.email}`,
    user: {
      id: updated.id,
      email: updated.email,
      is_premium: !!updated.is_premium,
      premium_since: updated.premium_since,
    },
  });
});

export default router;
