import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db.js";
import { JWT_SECRET, authMiddleware, type AuthUser } from "../middleware/auth.js";

const router = Router();

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";
const RESET_TOKEN_EXPIRY_HOURS = 1;

// ── Simple in-memory rate limiter ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

// ── Validation ──

function validateEmail(email: unknown): string | null {
  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return "Email is required";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return "Invalid email format";
  }
  if (email.trim().length > 254) {
    return "Email is too long";
  }
  return null;
}

function validatePassword(password: unknown): string | null {
  if (!password || typeof password !== "string") {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 128) {
    return "Password must be 128 characters or fewer";
  }
  return null;
}

// ── Helpers ──

function signToken(user: { id: number; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

function sanitizeUser(user: any) {
  const { password_hash, reset_token, reset_token_expires, ...safe } = user;
  return safe;
}

// ── Routes ──

// POST /api/auth/signup
router.post("/auth/signup", async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  const emailError = validateEmail(email);
  if (emailError) {
    res.status(400).json({ error: emailError });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const normalizedEmail = (email as string).trim().toLowerCase();

  // Check if user already exists
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password as string, BCRYPT_ROUNDS);
  const displayName = name && typeof name === "string" ? name.trim() : null;

  const result = db.prepare(
    "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)"
  ).run(normalizedEmail, passwordHash, displayName);

  const user = db.prepare("SELECT *, avatar_color as avatarColor FROM users WHERE id = ?").get(result.lastInsertRowid) as any;
  const token = signToken({ id: user.id, email: user.email });

  res.status(201).json({
    token,
    user: sanitizeUser(user),
  });
});

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  const ip = getClientIp(req);

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many login attempts. Please try again in a minute." });
    return;
  }

  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const normalizedEmail = (email as string).trim().toLowerCase();
  const user = db.prepare("SELECT *, avatar_color as avatarColor FROM users WHERE email = ?").get(normalizedEmail) as any;

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password as string, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({ id: user.id, email: user.email });

  res.json({
    token,
    user: sanitizeUser(user),
  });
});

// POST /api/auth/forgot-password
router.post("/auth/forgot-password", (req: Request, res: Response) => {
  const { email } = req.body;

  const emailError = validateEmail(email);
  if (emailError) {
    res.status(400).json({ error: emailError });
    return;
  }

  const normalizedEmail = (email as string).trim().toLowerCase();
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as any;

  // Always return the same message — don't reveal if email exists
  if (!user) {
    res.json({ message: "If an account with that email exists, a reset token has been generated." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?")
    .run(token, expires, user.id);

  // In production this would be emailed — for now return it directly
  res.json({
    message: "If an account with that email exists, a reset token has been generated.",
    token, // included for development since there's no email integration
    expires,
  });
});

// POST /api/auth/reset-password
router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    res.status(400).json({ error: "Email, token, and new password are required" });
    return;
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  const normalizedEmail = (email as string).trim().toLowerCase();
  const user = db.prepare(
    "SELECT * FROM users WHERE email = ? AND reset_token = ?"
  ).get(normalizedEmail, token as string) as any;

  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  // Check expiry
  if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
    res.status(400).json({ error: "Reset token has expired" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword as string, BCRYPT_ROUNDS);

  db.prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
  ).run(passwordHash, user.id);

  res.json({ message: "Password has been reset successfully. You can now log in." });
});

// GET /api/auth/me — protected, returns current user
router.get("/auth/me", authMiddleware, (req: Request, res: Response) => {
  const authUser = req.user as AuthUser;
  const user = db.prepare("SELECT *, avatar_color as avatarColor FROM users WHERE id = ?").get(authUser.id) as any;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: sanitizeUser(user) });
});

export default router;
