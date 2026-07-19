import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "medchron-dev-secret-change-in-production";

export interface AuthUser {
  id: number;
  email: string;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Public routes that don't require authentication
// Be specific — avoid matching /api/auth/me which DOES require auth
const PUBLIC_PATHS = [
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/health",
  "/api/admin",
  "/api/admin/",
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply auth to API routes — skip static files and SPA routes
  // Use baseUrl + path so this works both globally and inside routers
  const fullPath = req.baseUrl + req.path;
  if (!fullPath.startsWith("/api/")) {
    next();
    return;
  }

  // Skip auth for public API routes
  if (isPublicPath(fullPath)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export { JWT_SECRET };
