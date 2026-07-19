import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

// GET /api/stats/adherence?days=30
router.get("/stats/adherence", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const days = parseInt((req.query.days as string) || "30", 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "days must be between 1 and 365" });
    return;
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
         SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM doses
       WHERE scheduled_date >= ? AND user_id = ?`
    )
    .get(fromStr, userId) as any;

  const total = row.total || 0;
  const taken = row.taken || 0;
  const missed = row.missed || 0;
  const skipped = row.skipped || 0;
  const pending = row.pending || 0;

  // Adherence = taken / (taken + missed), skip and pending don't count
  const evaluable = taken + missed;
  const adherence = evaluable > 0 ? Math.round((taken / evaluable) * 100) : -1;

  // Also count total medications for this user
  const medCount = (db.prepare("SELECT COUNT(*) as count FROM medications WHERE user_id = ?").get(userId) as any).count;

  // ── Streak calculation ──
  // Get daily dose counts for the last 365 days
  const dailyRows = db
    .prepare(
      `SELECT
         scheduled_date,
         SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
         SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM doses
       WHERE scheduled_date >= date('now', '-365 days') AND user_id = ?
       GROUP BY scheduled_date
       ORDER BY scheduled_date DESC`
    )
    .all(userId) as any[];

  const todayStr = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let allTakenToday = false;

  // Find today's data
  const todayRow = dailyRows.find((r: any) => r.scheduled_date === todayStr);
  if (todayRow) {
    // All doses today are taken (no missed, no pending)
    if (todayRow.taken > 0 && todayRow.missed === 0 && todayRow.pending === 0) {
      allTakenToday = true;
    }
  }

  // Count streak: go backwards from today (or yesterday if today incomplete)
  // For today: counts if allTakenToday is true
  // For past days: all evaluable doses must be taken (no missed, no pending)
  const startFromDate = allTakenToday ? todayStr : new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Collect all days with at least 1 dose, sorted newest first
  const daysWithDoses = dailyRows
    .filter((r: any) => (r.taken + r.missed + r.pending) > 0)
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date)); // newest first

  // Find the starting index
  let startIdx = -1;
  for (let i = 0; i < daysWithDoses.length; i++) {
    if (daysWithDoses[i].scheduled_date === startFromDate) {
      startIdx = i;
      break;
    }
    if (daysWithDoses[i].scheduled_date < startFromDate) {
      // This day is before our start date, begin counting from here
      startIdx = i;
      break;
    }
  }

  if (startIdx >= 0) {
    for (let i = startIdx; i < daysWithDoses.length; i++) {
      const r = daysWithDoses[i];
      const allTaken = r.taken > 0 && r.missed === 0 && r.pending === 0;
      if (allTaken) {
        streak++;
      } else {
        break;
      }
    }
  }

  // Calculate streak start date
  let streakStartDate: string | null = null;
  if (streak > 0) {
    const streakEndIdx = startIdx + streak - 1;
    if (streakEndIdx < daysWithDoses.length) {
      streakStartDate = daysWithDoses[streakEndIdx].scheduled_date;
    }
  }

  res.json({
    days,
    from: fromStr,
    total,
    taken,
    missed,
    skipped,
    pending,
    adherence,
    totalMedications: medCount,
    streak,
    streakStartDate,
    allTakenToday,
  });
});

export default router;
