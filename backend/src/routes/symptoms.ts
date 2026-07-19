import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

// Validation constants
const MAX_NAME = 200;
const MAX_NOTES = 2000;
const COMMON_SYMPTOMS = [
  "Headache", "Nausea", "Fatigue", "Joint pain", "Dizziness",
  "Insomnia", "Anxiety", "Dry mouth", "Drowsiness", "Constipation",
  "Diarrhea", "Muscle pain", "Rash", "Blurred vision", "Weight gain",
];

function validateSymptom(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!body.name || (typeof body.name === "string" && body.name.trim().length === 0)) {
    errors.push("Symptom name is required");
  } else if (typeof body.name === "string" && body.name.trim().length > MAX_NAME) {
    errors.push(`Name must be ${MAX_NAME} characters or fewer`);
  }

  if (body.severity !== undefined) {
    const sev = Number(body.severity);
    if (isNaN(sev) || sev < 1 || sev > 5 || !Number.isInteger(sev)) {
      errors.push("Severity must be an integer between 1 and 5");
    }
  } else {
    errors.push("Severity is required");
  }

  if (body.notes && typeof body.notes === "string" && body.notes.length > MAX_NOTES) {
    errors.push(`Notes must be ${MAX_NOTES} characters or fewer`);
  }

  if (body.logged_at) {
    const d = new Date(body.logged_at as string);
    if (isNaN(d.getTime())) {
      errors.push("logged_at must be a valid date");
    }
  }

  return errors;
}

// GET /api/symptoms/patterns?days=30 — frequency counts by symptom name
// Must be defined BEFORE /api/symptoms/:id to avoid "patterns" being captured as :id
router.get("/symptoms/patterns", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const days = parseInt((req.query.days as string) || "30", 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "days must be between 1 and 365" });
    return;
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT name, COUNT(*) as count, ROUND(AVG(severity), 1) as avgSeverity
       FROM symptoms
       WHERE logged_at >= ? AND user_id = ?
       GROUP BY name
       ORDER BY count DESC, avgSeverity DESC`
    )
    .all(fromStr, userId) as any[];

  res.json(rows);
});

// GET /api/symptoms/common — list common symptom names for suggestions
// Must be defined BEFORE /api/symptoms/:id to avoid "common" being captured as :id
router.get("/symptoms/common", (_req: Request, res: Response) => {
  res.json(COMMON_SYMPTOMS);
});

// GET /api/symptoms?from=&to= — list symptoms in date range
router.get("/symptoms", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const to = (req.query.to as string) || new Date().toISOString();
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString();
  const from = (req.query.from as string) || defaultFrom;

  const symptoms = db
    .prepare(
      `SELECT s.*, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.logged_at >= ? AND s.logged_at <= ? AND s.user_id = ?
       ORDER BY s.logged_at DESC`
    )
    .all(from, to, userId);

  res.json(symptoms);
});

// POST /api/symptoms — create a new symptom entry
router.post("/symptoms", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const errors = validateSymptom(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors: errors.map((e) => ({ field: "body", message: e })) });
    return;
  }

  const { name, severity, notes, logged_at, medication_id } = req.body;
  const sev = Number(severity);
  const loggedAt = (logged_at as string) || new Date().toISOString();
  const medId = medication_id !== undefined && medication_id !== null && medication_id !== ""
    ? Number(medication_id)
    : null;

  const stmt = db.prepare(`
    INSERT INTO symptoms (user_id, name, severity, notes, logged_at, medication_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    (name as string).trim(),
    sev,
    (notes as string)?.trim() || "",
    loggedAt,
    medId
  );

  const symptom = db
    .prepare(
      `SELECT s.*, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.id = ? AND s.user_id = ?`
    )
    .get(result.lastInsertRowid, userId);

  res.status(201).json(symptom);
});

// PUT /api/symptoms/:id — edit a symptom entry
router.put("/symptoms/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid symptom ID" });
    return;
  }

  const existing = db.prepare("SELECT * FROM symptoms WHERE id = ? AND user_id = ?").get(id, userId) as any;
  if (!existing) {
    res.status(404).json({ error: "Symptom not found" });
    return;
  }

  const errors = validateSymptom({ ...existing, ...req.body });
  if (errors.length > 0) {
    res.status(400).json({ errors: errors.map((e) => ({ field: "body", message: e })) });
    return;
  }

  const { name, severity, notes, logged_at, medication_id } = req.body;

  db.prepare(`
    UPDATE symptoms
    SET name = ?, severity = ?, notes = ?, logged_at = ?,
        medication_id = ?
    WHERE id = ? AND user_id = ?
  `).run(
    name !== undefined ? (name as string).trim() : existing.name,
    severity !== undefined ? Number(severity) : existing.severity,
    notes !== undefined ? ((notes as string)?.trim() || "") : existing.notes,
    logged_at !== undefined ? (logged_at as string) : existing.logged_at,
    medication_id !== undefined && medication_id !== "" ? Number(medication_id) : (existing.medication_id ?? null),
    id,
    userId
  );

  const updated = db
    .prepare(
      `SELECT s.*, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.id = ? AND s.user_id = ?`
    )
    .get(id, userId);

  res.json(updated);
});

// DELETE /api/symptoms/:id — delete a symptom entry
router.delete("/symptoms/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid symptom ID" });
    return;
  }

  const existing = db.prepare("SELECT * FROM symptoms WHERE id = ? AND user_id = ?").get(id, userId);
  if (!existing) {
    res.status(404).json({ error: "Symptom not found" });
    return;
  }

  db.prepare("DELETE FROM symptoms WHERE id = ? AND user_id = ?").run(id, userId);
  res.json({ success: true });
});

// GET /api/timeline?from=&to= — combined doses + symptoms feed
router.get("/timeline", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const to = (req.query.to as string) || new Date().toISOString();
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString();
  const from = (req.query.from as string) || defaultFrom;

  // Fetch doses in range
  const doses = db
    .prepare(
      `SELECT d.id, d.scheduled_date, d.scheduled_time, d.status, d.taken_at,
              d.notes, d.medication_id, m.name as medication_name,
              m.dosage as medication_dosage
       FROM doses d
       JOIN medications m ON d.medication_id = m.id
       WHERE d.scheduled_date >= date(?) AND d.scheduled_date <= date(?) AND d.user_id = ?
       ORDER BY d.scheduled_date DESC, d.scheduled_time DESC`
    )
    .all(from.slice(0, 10), to.slice(0, 10), userId);

  // Fetch symptoms in range
  const symptoms = db
    .prepare(
      `SELECT s.*, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.logged_at >= ? AND s.logged_at <= ? AND s.user_id = ?
       ORDER BY s.logged_at DESC`
    )
    .all(from, to, userId);

  // Build unified timeline entries
  const doseEntries = (doses as any[]).map((d) => ({
    type: "dose" as const,
    id: `dose-${d.id}`,
    timestamp: `${d.scheduled_date}T${d.scheduled_time}:00`,
    medication_name: d.medication_name,
    medication_id: d.medication_id,
    dosage: d.medication_dosage,
    status: d.status,
    taken_at: d.taken_at,
    scheduled_time: d.scheduled_time,
    scheduled_date: d.scheduled_date,
    notes: d.notes,
  }));

  const symptomEntries = (symptoms as any[]).map((s) => ({
    type: "symptom" as const,
    id: `symptom-${s.id}`,
    timestamp: s.logged_at,
    name: s.name,
    severity: s.severity,
    notes: s.notes,
    medication_id: s.medication_id,
    medication_name: s.medication_name,
  }));

  // Merge and sort by timestamp descending
  const timeline = [...doseEntries, ...symptomEntries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  res.json(timeline);
});

export default router;
