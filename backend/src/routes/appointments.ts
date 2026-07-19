import { Router, Request, Response } from "express";
import db from "../db.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateAppointment(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.title || (typeof body.title === "string" && body.title.trim().length === 0)) {
    errors.push({ field: "title", message: "Title is required" });
  } else if (typeof body.title === "string" && body.title.trim().length > 200) {
    errors.push({ field: "title", message: "Title must be 200 characters or fewer" });
  }

  if (body.doctor_name && typeof body.doctor_name === "string" && body.doctor_name.length > 200) {
    errors.push({ field: "doctor_name", message: "Doctor name must be 200 characters or fewer" });
  }

  if (body.location && typeof body.location === "string" && body.location.length > 500) {
    errors.push({ field: "location", message: "Location must be 500 characters or fewer" });
  }

  if (!body.date || (typeof body.date === "string" && body.date.trim().length === 0)) {
    errors.push({ field: "date", message: "Date is required" });
  } else if (typeof body.date === "string") {
    const d = new Date(body.date);
    if (isNaN(d.getTime())) {
      errors.push({ field: "date", message: "Date must be a valid date" });
    }
  }

  if (body.notes && typeof body.notes === "string" && body.notes.length > 2000) {
    errors.push({ field: "notes", message: "Notes must be 2000 characters or fewer" });
  }

  return errors;
}

// GET /api/appointments/upcoming — next 5 upcoming appointments (must come before /:id)
router.get("/upcoming", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const today = new Date().toISOString().slice(0, 10);
  const appointments = db.prepare(`
    SELECT * FROM appointments
    WHERE date >= ? AND user_id = ?
    ORDER BY date ASC, time ASC
    LIMIT 5
  `).all(today, userId);
  res.json(appointments);
});

// GET /api/appointments — list all appointments
router.get("/", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const appointments = db.prepare(`
    SELECT * FROM appointments
    WHERE user_id = ?
    ORDER BY date ASC, time ASC
  `).all(userId);
  res.json(appointments);
});

// GET /api/appointments/:id — get a single appointment
router.get("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.json(appt);
});

// POST /api/appointments — create an appointment
router.post("/", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const errors = validateAppointment(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const { title, doctor_name, location, date, time, notes } = req.body;

  const stmt = db.prepare(`
    INSERT INTO appointments (user_id, title, doctor_name, location, date, time, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    (title as string).trim(),
    (doctor_name as string)?.trim() || "",
    (location as string)?.trim() || "",
    (date as string).trim(),
    (time as string)?.trim() || "",
    (notes as string)?.trim() || ""
  );

  const appt = db.prepare("SELECT * FROM appointments WHERE id = ? AND user_id = ?").get(result.lastInsertRowid, userId);
  res.status(201).json(appt);
});

// PUT /api/appointments/:id — update an appointment
router.put("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const existing = db.prepare("SELECT * FROM appointments WHERE id = ? AND user_id = ?").get(req.params.id, userId) as any;
  if (!existing) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const errors = validateAppointment(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const { title, doctor_name, location, date, time, notes } = req.body;

  db.prepare(`
    UPDATE appointments
    SET title = ?, doctor_name = ?, location = ?, date = ?, time = ?, notes = ?
    WHERE id = ? AND user_id = ?
  `).run(
    (title as string).trim(),
    (doctor_name as string)?.trim() || "",
    (location as string)?.trim() || "",
    (date as string).trim(),
    (time as string)?.trim() || "",
    (notes as string)?.trim() || "",
    req.params.id,
    userId
  );

  const updated = db.prepare("SELECT * FROM appointments WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  res.json(updated);
});

// DELETE /api/appointments/:id — delete an appointment
router.delete("/:id", (req: Request, res: Response) => {
  const userId = getUserId(req);
  const appt = db.prepare("SELECT * FROM appointments WHERE id = ? AND user_id = ?").get(req.params.id, userId);
  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  db.prepare("DELETE FROM appointments WHERE id = ? AND user_id = ?").run(req.params.id, userId);
  res.json({ success: true });
});

export default router;
