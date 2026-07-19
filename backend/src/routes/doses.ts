import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

// Frequency parsing: determine doses-per-day and times from free-text frequency
function parseFrequency(frequency: string): string[] {
  const f = frequency.toLowerCase().trim();
  if (!f) return ["08:00"];

  // PRN / as needed — no scheduled doses
  if (/as needed|prn|when necessary|pro re nata/.test(f)) {
    return [];
  }

  // Once weekly
  if (/once (a |per )?week|weekly|1x.?week/.test(f)) {
    return ["08:00"];
  }

  // Three times daily
  if (/(three|3)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(f) || /t\.?i\.?d/i.test(f)) {
    return ["08:00", "14:00", "20:00"];
  }

  // Twice daily
  if (/(twice|two|2)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(f) || /b\.?i\.?d/i.test(f)) {
    return ["08:00", "20:00"];
  }

  // Four times daily
  if (/(four|4)\s*(x|times?)\s*(a\s*)?(day|daily)/i.test(f) || /q\.?i\.?d/i.test(f)) {
    return ["08:00", "12:00", "16:00", "20:00"];
  }

  // Once daily (default)
  return ["08:00"];
}

// GET /api/medications/:id/doses?date=YYYY-MM-DD
router.get("/medications/:id/doses", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const medicationId = parseInt(req.params.id as string, 10);
  if (isNaN(medicationId)) {
    res.status(400).json({ error: "Invalid medication ID" });
    return;
  }

  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const doses = db
    .prepare(
      `SELECT d.*, m.name as medication_name, m.dosage as medication_dosage, m.frequency as medication_frequency
       FROM doses d JOIN medications m ON d.medication_id = m.id
       WHERE d.medication_id = ? AND d.scheduled_date = ? AND d.user_id = ?
       ORDER BY d.scheduled_time ASC`
    )
    .all(medicationId, date, userId);
  res.json(doses);
});

// POST /api/doses/midnight-mark — mark all pending doses for a date as missed
router.post("/doses/midnight-mark", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Valid date required (YYYY-MM-DD)" });
  }

  const result = db.prepare(
    `UPDATE doses SET status = 'missed'
     WHERE scheduled_date = ? AND user_id = ?
     AND status = 'pending'`
  ).run(date, userId);

  res.json({ marked: result.changes });
});

// GET /api/doses/today
router.get("/doses/today", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const dateParam = (req.query.date as string);
  const tzOffset = parseInt(req.query.tzOffset as string) || 0; // minutes, positive = behind UTC
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const today = (dateParam && dateRegex.test(dateParam))
    ? dateParam
    : new Date(Date.now() - tzOffset * 60000).toISOString().slice(0, 10);

  const doses = db
    .prepare(
      `SELECT d.*, m.name as medication_name, m.dosage as medication_dosage, m.frequency as medication_frequency
       FROM doses d JOIN medications m ON d.medication_id = m.id
       WHERE d.scheduled_date = ? AND d.user_id = ?
       ORDER BY d.scheduled_time ASC, m.name ASC`
    )
    .all(today, userId);
  res.json(doses);
});

// GET /api/doses/history?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/doses/history", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const from = (req.query.from as string) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

  const doses = db
    .prepare(
      `SELECT d.*, m.name as medication_name, m.dosage as medication_dosage, m.frequency as medication_frequency
       FROM doses d JOIN medications m ON d.medication_id = m.id
       WHERE d.scheduled_date >= ? AND d.scheduled_date <= ? AND d.user_id = ?
       ORDER BY d.scheduled_date DESC, d.scheduled_time ASC`
    )
    .all(from, to, userId);
  res.json(doses);
});

// POST /api/doses/schedule — auto-generate pending doses for next 7 days
router.post("/doses/schedule", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const { medicationId, frequency, startDate, reminderTimes, timezoneOffset } = req.body;

  if (!medicationId || !frequency) {
    res.status(400).json({ error: "medicationId and frequency are required" });
    return;
  }

  // Verify the medication belongs to this user
  const med = db.prepare("SELECT id FROM medications WHERE id = ? AND user_id = ?").get(medicationId, userId) as any;
  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  // Use custom reminder times if provided, otherwise parse from frequency text
  let times: string[];
  if (reminderTimes && Array.isArray(reminderTimes) && reminderTimes.length > 0) {
    times = reminderTimes.map((t: unknown) => String(t));
  } else {
    times = parseFrequency(frequency);
  }
  if (times.length === 0) {
    res.json({ generated: 0, message: "PRN/as-needed — no doses scheduled" });
    return;
  }

  // Compute start date: user-provided date, or today adjusted for the user's timezone
  let start: Date;
  if (startDate) {
    start = new Date(startDate + "T00:00:00");
  } else {
    start = new Date();
    // If timezone offset provided, adjust to user's local date
    if (typeof timezoneOffset === "number" && !isNaN(timezoneOffset)) {
      // timezoneOffset: minutes ahead of UTC (negative for west, positive for east)
      // E.g., UTC-4 → -240, UTC+5:30 → 330
      const userOffsetMs = timezoneOffset * 60 * 1000;
      const localTime = new Date(start.getTime() + userOffsetMs);
      // Use the user's local date as the start
      start = new Date(localTime.toISOString().slice(0, 10) + "T00:00:00");
    }
  }
  let generated = 0;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO doses (user_id, medication_id, scheduled_date, scheduled_time, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const checkStmt = db.prepare(
    `SELECT id FROM doses WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ? AND user_id = ?`
  );

  const insertMany = db.transaction(() => {
    for (let day = 0; day < 7; day++) {
      const d = new Date(start);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().slice(0, 10);

      for (const time of times) {
        const existing = checkStmt.get(medicationId, dateStr, time, userId);
        if (!existing) {
          insertStmt.run(userId, medicationId, dateStr, time);
          generated++;
        }
      }
    }
  });

  insertMany();
  res.json({ generated });
});

// PUT /api/doses/:id — update dose status
router.put("/doses/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const doseId = parseInt(req.params.id as string, 10);
  if (isNaN(doseId)) {
    res.status(400).json({ error: "Invalid dose ID" });
    return;
  }

  const dose = db.prepare("SELECT * FROM doses WHERE id = ? AND user_id = ?").get(doseId, userId) as any;
  if (!dose) {
    res.status(404).json({ error: "Dose not found" });
    return;
  }

  const { status, notes, taken_at } = req.body;
  const validStatuses = ["pending", "taken", "missed", "skipped"];

  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
    return;
  }

  const newStatus = status || dose.status;
  const newNotes = notes !== undefined ? String(notes) : dose.notes;

  // Determine taken_at:
  // - If explicitly provided in body (from edit modal), use it
  // - If status changed to "taken" without explicit time, auto-generate HH:MM
  // - Otherwise keep existing value
  let newTakenAt: string | null = dose.taken_at;
  if (taken_at !== undefined) {
    // Explicit: use provided value (null clears it; string sets it)
    newTakenAt = taken_at || null;
  } else if (newStatus === "taken" && dose.status !== "taken") {
    // Auto-generate current time in HH:MM
    const now = new Date();
    newTakenAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  db.prepare(
    `UPDATE doses SET status = ?, notes = ?, taken_at = ? WHERE id = ? AND user_id = ?`
  ).run(newStatus, newNotes, newTakenAt, doseId, userId);

  const updated = db.prepare(
    `SELECT d.*, m.name as medication_name, m.dosage as medication_dosage, m.frequency as medication_frequency
     FROM doses d JOIN medications m ON d.medication_id = m.id
     WHERE d.id = ? AND d.user_id = ?`
  ).get(doseId, userId);

  res.json(updated);
});

// POST /api/doses/:id/confirm — confirm a dose as taken with cascade rule
router.post("/doses/:id/confirm", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const doseId = parseInt(req.params.id as string, 10);
  if (isNaN(doseId)) {
    res.status(400).json({ error: "Invalid dose ID" });
    return;
  }

  const dose = db.prepare("SELECT * FROM doses WHERE id = ? AND user_id = ?").get(doseId, userId) as any;
  if (!dose) {
    res.status(404).json({ error: "Dose not found" });
    return;
  }

  const affectedIds: number[] = [];
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const doConfirm = db.transaction(() => {
    // 1. Mark the tapped dose as taken
    db.prepare(
      `UPDATE doses SET status = 'taken', taken_at = ? WHERE id = ? AND user_id = ?`
    ).run(nowTime, doseId, userId);
    affectedIds.push(doseId);

    // 2. Cascade: find earlier pending doses of the SAME medication on the SAME day
    //    that are still pending, and mark them as skipped
    const earlierDoses = db.prepare(
      `SELECT id FROM doses
       WHERE medication_id = ? AND scheduled_date = ? AND user_id = ?
       AND status = 'pending'
       AND scheduled_time < ?
       AND id != ?
       ORDER BY scheduled_time ASC`
    ).all(
      dose.medication_id,
      dose.scheduled_date,
      userId,
      dose.scheduled_time,
      doseId
    ) as any[];

    if (earlierDoses.length > 0) {
      const skipStmt = db.prepare(
        `UPDATE doses SET status = 'skipped' WHERE id = ? AND user_id = ?`
      );
      for (const ed of earlierDoses) {
        skipStmt.run(ed.id, userId);
        affectedIds.push(ed.id);
      }
    }
  });

  doConfirm();

  // Return all affected dose IDs + updated doses
  const updatedDoses = db.prepare(
    `SELECT d.*, m.name as medication_name, m.dosage as medication_dosage, m.frequency as medication_frequency
     FROM doses d JOIN medications m ON d.medication_id = m.id
     WHERE d.id IN (${affectedIds.map(() => '?').join(',')}) AND d.user_id = ?`
  ).all(...affectedIds, userId);

  res.json({
    confirmed: doseId,
    cascadeSkipped: affectedIds.filter(id => id !== doseId),
    affectedIds,
    doses: updatedDoses,
  });
});

export default router;
