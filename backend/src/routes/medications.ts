import { Router, Request, Response } from "express";
import db from "../db.js";
import { lookupMedication } from "../services/medData.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

// ── Dose-form suffixes to strip from medication names ──
const DOSE_FORM_SUFFIXES = [
  "Chewable Tablet", "Extended Release", "Injectable Solution",
  "Oral Capsule", "Oral Solution", "Oral Tablet",
  "Capsule", "Inhaler", "Injection", "Lozenge",
  "Ointment", "Patch", "Pill", "Powder",
  "Solution", "Spray", "Suppository", "Suspension",
  "Syrup", "Tablet", "Cream", "Drops",
  "Elixir", "Gel",
  "Tab", "Cap", "Sol", "Susp", "Inj",
  "Granule", "Packet", "Kit", "Lotion",
  "ER", "XR", "SR", "DR", "IR", "LA",
];
// Sort by length descending so longer multi-word suffixes match first
DOSE_FORM_SUFFIXES.sort((a, b) => b.length - a.length);

function cleanMedicationName(name: string): string {
  let cleaned = name.trim();

  // Strip one trailing dose-form suffix (case-insensitive)
  for (const suffix of DOSE_FORM_SUFFIXES) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\s+${escaped}$`, "i");
    if (re.test(cleaned)) {
      cleaned = cleaned.replace(re, "");
      break;
    }
  }

  // Title case: capitalize first letter of each word, lowercase the rest
  cleaned = cleaned.replace(/\b\w+/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );

  return cleaned;
}

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

// Validation constants
const MAX_NAME = 200;
const MAX_DOSAGE = 100;
const MAX_FREQUENCY = 100;
const MAX_DOCTOR = 200;
const MAX_INSTRUCTIONS = 2000;

interface ValidationError {
  field: string;
  message: string;
}

function validateMedication(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // name — required
  if (!body.name || (typeof body.name === "string" && body.name.trim().length === 0)) {
    errors.push({ field: "name", message: "Medication name is required" });
  } else if (typeof body.name === "string" && body.name.trim().length > MAX_NAME) {
    errors.push({ field: "name", message: `Name must be ${MAX_NAME} characters or fewer` });
  }

  // dosage — optional but length-limited
  if (body.dosage && typeof body.dosage === "string" && body.dosage.length > MAX_DOSAGE) {
    errors.push({ field: "dosage", message: `Dosage must be ${MAX_DOSAGE} characters or fewer` });
  }

  // frequency — optional but length-limited
  if (body.frequency && typeof body.frequency === "string" && body.frequency.length > MAX_FREQUENCY) {
    errors.push({ field: "frequency", message: `Frequency must be ${MAX_FREQUENCY} characters or fewer` });
  }

  // prescribing_doctor — optional but length-limited
  if (body.prescribing_doctor && typeof body.prescribing_doctor === "string" && body.prescribing_doctor.length > MAX_DOCTOR) {
    errors.push({ field: "prescribing_doctor", message: `Doctor name must be ${MAX_DOCTOR} characters or fewer` });
  }

  // instructions — optional but length-limited
  if (body.instructions && typeof body.instructions === "string" && body.instructions.length > MAX_INSTRUCTIONS) {
    errors.push({ field: "instructions", message: `Instructions must be ${MAX_INSTRUCTIONS} characters or fewer` });
  }

  // refill_date — optional but must be a valid date if provided
  if (body.refill_date && typeof body.refill_date === "string" && body.refill_date.trim().length > 0) {
    const d = new Date(body.refill_date);
    if (isNaN(d.getTime())) {
      errors.push({ field: "refill_date", message: "Refill date must be a valid date" });
    }
  }

  return errors;
}

// ── Static-path routes (must come before /:id routes) ──

// GET /api/medications — list all medications for current user
router.get("/", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const meds = db.prepare("SELECT * FROM medications WHERE user_id = ? ORDER BY created_at DESC").all(userId);
  res.json(meds);
});

// GET /api/medications/refills — get all medications sorted by refill urgency
router.get("/refills", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const meds = db.prepare(`
    SELECT * FROM medications
    WHERE user_id = ? AND refill_date IS NOT NULL AND refill_date != ''
    ORDER BY refill_date ASC
  `).all(userId);
  res.json(meds);
});

// POST /api/medications — create a medication
router.post("/", (req: Request, res: Response) => {
  const errors = validateMedication(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const userId = getUserId(req);
  const { name, dosage, quantity, frequency, prescribing_doctor, refill_date, instructions, reminder_times } = req.body;

  const stmt = db.prepare(`
    INSERT INTO medications (user_id, name, dosage, quantity, frequency, prescribing_doctor, refill_date, instructions, reminder_times)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    cleanMedicationName(name as string),
    (dosage as string)?.trim() || "",
    (quantity as string)?.trim() || "",
    (frequency as string)?.trim() || "",
    (prescribing_doctor as string)?.trim() || "",
    (refill_date as string)?.trim() || "",
    (instructions as string)?.trim() || "",
    reminder_times && typeof reminder_times === "string" ? reminder_times : null
  );

  const med = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(result.lastInsertRowid, userId);
  res.status(201).json(med);
});

// ── Medication API data routes ──

// POST /api/medications/lookup — search FDA for medication info by name
router.post("/lookup", async (_req: Request, res: Response) => {
  const { name } = _req.body as { name?: string };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Medication name is required" });
    return;
  }

  try {
    const drugInfo = await lookupMedication(name.trim());
    if (drugInfo) {
      res.json(drugInfo);
    } else {
      res.status(404).json({ error: "Medication not found in FDA database" });
    }
  } catch (err) {
    console.error("Lookup error:", err);
    res.status(502).json({ error: "Failed to look up medication data. Please try again later." });
  }
});

// ── Parameterized routes (/api/medications/:id, /:id/info, /:id/refill) ──

// GET /api/medications/:id/info — combine DB medication with FDA drug data
// MUST come before GET /:id to avoid "info" being captured as an :id
router.get("/:id/info", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const med = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId) as any;
  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  let drugInfo = null;
  try {
    drugInfo = await lookupMedication(med.name);
  } catch (err) {
    console.error("FDA lookup error in info endpoint:", err);
  }

  res.json({
    medication: med,
    fda: drugInfo,
  });
});

// GET /api/medications/:id — get a single medication
router.get("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const med = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }
  res.json(med);
});

// PUT /api/medications/:id — update a medication
router.put("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const existing = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  if (!existing) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  const errors = validateMedication(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const { name, dosage, quantity, frequency, prescribing_doctor, refill_date, instructions, reminder_times } = req.body;
  const medAny = existing as any;

  db.prepare(`
    UPDATE medications
    SET name = ?, dosage = ?, quantity = ?, frequency = ?, prescribing_doctor = ?, refill_date = ?, instructions = ?, reminder_times = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(
    name !== undefined ? cleanMedicationName(name as string) : medAny.name,
    dosage !== undefined ? ((dosage as string)?.trim() || "") : medAny.dosage,
    quantity !== undefined ? ((quantity as string)?.trim() || "") : medAny.quantity,
    frequency !== undefined ? ((frequency as string)?.trim() || "") : medAny.frequency,
    prescribing_doctor !== undefined ? ((prescribing_doctor as string)?.trim() || "") : medAny.prescribing_doctor,
    refill_date !== undefined ? ((refill_date as string)?.trim() || "") : medAny.refill_date,
    instructions !== undefined ? ((instructions as string)?.trim() || "") : medAny.instructions,
    reminder_times !== undefined ? (reminder_times && typeof reminder_times === "string" ? reminder_times : null) : medAny.reminder_times,
    req.params.id,
    userId
  );

  const updated = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  res.json(updated);
});

// PUT /api/medications/:id/refill — toggle refill status (premium feature)
router.put("/:id/refill", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const med = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId) as any;
  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  const { status } = req.body as { status?: string };

  if (status !== undefined && status !== null && !["requested", "filled"].includes(status)) {
    res.status(400).json({ error: "Invalid refill status. Must be 'requested' or 'filled'." });
    return;
  }

  const newStatus = status !== undefined ? status : (med.refill_status === "requested" ? null : "requested");

  db.prepare(`
    UPDATE medications
    SET refill_status = ?, refill_requested_at = CASE WHEN ? = 'requested' THEN datetime('now') ELSE refill_requested_at END, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(newStatus, newStatus, req.params.id, userId);

  const updated = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  res.json(updated);
});

// DELETE /api/medications/:id — delete a medication
router.delete("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const med = db.prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  db.prepare("DELETE FROM medications WHERE id = ? AND user_id = ?").run(req.params.id, userId);
  res.json({ success: true });
});

export default router;
