import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

// GET /api/reports — list all reports for the authenticated user
router.get("/reports", (req: Request, res: Response) => {
  const userId = getUserId(req);

  const reports = db
    .prepare(
      "SELECT id, title, content, report_type, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as {
    id: number;
    title: string;
    content: string;
    report_type: string;
    created_at: string;
  }[];

  res.json({ reports });
});

// POST /api/reports — save a new report
router.post("/reports", (req: Request, res: Response) => {
  const userId = getUserId(req);

  const { title, content, report_type } = req.body as {
    title?: string;
    content?: string;
    report_type?: string;
  };

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const stmt = db.prepare(
    "INSERT INTO reports (user_id, title, content, report_type) VALUES (?, ?, ?, ?)"
  );
  const result = stmt.run(
    userId,
    title.trim(),
    content.trim(),
    (report_type as string)?.trim() || "doctor-report"
  );

  const report = db
    .prepare("SELECT id, title, content, report_type, created_at FROM reports WHERE id = ? AND user_id = ?")
    .get(result.lastInsertRowid, userId) as {
    id: number;
    title: string;
    content: string;
    report_type: string;
    created_at: string;
  };

  res.status(201).json({ report });
});

// GET /api/reports/:id — get a single report
router.get("/reports/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = parseInt(req.params.id as string, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid report ID" });
    return;
  }

  const report = db
    .prepare(
      "SELECT id, title, content, report_type, created_at FROM reports WHERE id = ? AND user_id = ?"
    )
    .get(id, userId) as {
    id: number;
    title: string;
    content: string;
    report_type: string;
    created_at: string;
  } | undefined;

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json({ report });
});

export default router;
