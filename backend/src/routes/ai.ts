import { Router, Request, Response } from "express";
import db from "../db.js";
import { chat } from "../ai.js";
import { lookupMedication, formatDrugInfoForPrompt } from "../services/medData.js";
import type { AuthUser } from "../middleware/auth.js";

const router = Router();

function getUserId(req: Request): number {
  return (req.user as AuthUser).id;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// POST /api/ai/detect-action — detect if user wants to add medication/symptom/appointment
router.post("/ai/detect-action", async (req: Request, res: Response) => {
  const { question, context } = req.body as {
    question?: string;
    context?: string;
  };

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  const systemPrompt = `You are an intent detector. Analyze the user's message and determine if they want to add a medication, log a symptom, or schedule an appointment. If they do, extract the structured data. If not, respond with "none".

If ADD_MEDICATION: extract name, dosage, frequency, instructions
If ADD_SYMPTOM: extract name, severity (1-10), notes
If ADD_APPOINTMENT: extract title, doctor_name, date (YYYY-MM-DD), time (HH:MM), location, notes

Respond ONLY in this JSON format (no other text):
{"intent":"add_medication","data":{"name":"Trazodone","dosage":"50mg","frequency":"once daily","instructions":""}}
{"intent":"add_symptom","data":{"name":"headache","severity":5,"notes":"started after lunch"}}
{"intent":"add_appointment","data":{"title":"Checkup","doctor_name":"Dr. Smith","date":"2026-07-25","time":"14:00","location":"","notes":""}}
{"intent":"none"}

For any ambiguous or partial information, include what you can extract and leave missing fields as empty strings.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Here is additional context about the user's medications and health:\n${context}`,
    });
  }

  messages.push({
    role: "user",
    content: question.trim(),
  });

  try {
    const raw = await chat(messages, { temperature: 0.1, maxTokens: 300 });

    // Try to parse JSON from the response
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.json({ action: null });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.intent || parsed.intent === "none") {
      res.json({ action: null });
      return;
    }

    // Validate the intent is one we recognize
    const validIntents = ["add_medication", "add_symptom", "add_appointment"];
    if (!validIntents.includes(parsed.intent)) {
      res.json({ action: null });
      return;
    }

    // Ensure data is an object
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};

    res.json({ action: { intent: parsed.intent, data } });
  } catch {
    // Graceful failure — treat as no intent detected
    res.json({ action: null });
  }
});

// POST /api/ai/chat — general medication Q&A
router.post("/ai/chat", async (req: Request, res: Response) => {
  const { question, context } = req.body as {
    question?: string;
    context?: string;
  };

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  const messages: ChatMessage[] = [];

  if (context) {
    messages.push({
      role: "system",
      content: `Here is additional context about the user's medications and health:\n${context}`,
    });
  }

  messages.push({
    role: "user",
    content: question.trim(),
  });

  const answer = await chat(messages, { temperature: 0.5 });
  res.json({ answer });
});

// POST /api/ai/explain/:medicationId — explain a specific medication
router.post("/ai/explain/:medicationId", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const medicationId = parseInt(String(req.params.medicationId), 10);
  if (isNaN(medicationId)) {
    res.status(400).json({ error: "Invalid medication ID" });
    return;
  }

  const med = db
    .prepare("SELECT * FROM medications WHERE id = ? AND user_id = ?")
    .get(medicationId, userId) as any;

  if (!med) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }

  // Fetch real FDA drug data to enrich the explanation
  const drugInfo = await lookupMedication(med.name);

  let fdaContext = "";
  if (drugInfo) {
    fdaContext = `\n\nOfficial FDA drug information for ${med.name}:\n${formatDrugInfoForPrompt(drugInfo)}`;
  }

  const userMessage = `Please explain the medication "${med.name}" in simple, patient-friendly language.

Medication details from the user's prescription:
- Name: ${med.name}
- Dosage: ${med.dosage || "Not specified"}
- Frequency: ${med.frequency || "Not specified"}
- Instructions: ${med.instructions || "None provided"}${fdaContext}

Please cover:
1. What this medication is typically used for
2. How it works (in simple terms)
3. Common side effects (use the FDA data if provided, but explain in plain language)
4. Important precautions or interactions
5. Tips for taking it safely and effectively

If FDA drug information is provided above, use it to give accurate, evidence-based explanations. Synthesize the official FDA data with the user's personal prescription details so the explanation feels personalized.

End with a reminder to consult their doctor for personal medical advice.`;

  const answer = await chat([{ role: "user", content: userMessage }], {
    temperature: 0.3,
  });
  res.json({ answer, medication: med, fdaData: drugInfo !== null });
});

// POST /api/ai/summary?days=30 — medication history summary
router.post("/ai/summary", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const days = parseInt((req.query.days as string) || "30", 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "days must be between 1 and 365" });
    return;
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  // Get adherence stats
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
  const evaluable = taken + missed;
  const adherence = evaluable > 0 ? Math.round((taken / evaluable) * 100) : 100;

  // Get medications
  const medications = db
    .prepare("SELECT id, name, dosage, frequency FROM medications WHERE user_id = ? ORDER BY name")
    .all(userId) as any[];

  // Get symptoms
  const symptoms = db
    .prepare(
      `SELECT s.name, s.severity, s.logged_at, s.notes, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.logged_at >= ? AND s.user_id = ?
       ORDER BY s.logged_at DESC`
    )
    .all(fromStr, userId) as any[];

  // Build context
  const medList = medications
    .map((m) => `- ${m.name} ${m.dosage} (${m.frequency})`)
    .join("\n");

  const symptomList =
    symptoms.length > 0
      ? symptoms
          .map(
            (s) =>
              `- ${s.logged_at.slice(0, 10)}: ${s.name} (severity ${s.severity}/5)${
                s.medication_name ? ` — linked to ${s.medication_name}` : ""
              }`
          )
          .join("\n")
      : "No symptoms logged in this period.";

  const userMessage = `Please summarize my medication history for the past ${days} days.

Here is my data:

Adherence:
- Total scheduled doses: ${total}
- Taken: ${taken} (${adherence}% adherence)
- Missed: ${missed}
- Skipped: ${skipped}
- Pending: ${pending}

My medications:
${medList}

Symptoms logged in this period:
${symptomList}

Please provide:
1. A brief summary of my adherence (is it good, needs improvement?)
2. Notable patterns or trends
3. Any observations about symptom frequency
4. Gentle encouragement or suggestions (always with "talk to your doctor" disclaimer)

Keep it concise (under 500 words), friendly, and supportive. End with a reminder to discuss concerns with their doctor.`;

  const answer = await chat([{ role: "user", content: userMessage }], {
    temperature: 0.4,
  });

  res.json({
    answer,
    stats: { days, total, taken, missed, skipped, pending, adherence },
  });
});

// POST /api/ai/doctor-report?days=30 — structured doctor visit report
router.post("/ai/doctor-report", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const days = parseInt((req.query.days as string) || "30", 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "days must be between 1 and 365" });
    return;
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  // Adherence per medication
  const medAdherence = db
    .prepare(
      `SELECT m.name, m.dosage, m.frequency,
         COUNT(*) as total,
         SUM(CASE WHEN d.status = 'taken' THEN 1 ELSE 0 END) as taken,
         SUM(CASE WHEN d.status = 'missed' THEN 1 ELSE 0 END) as missed
       FROM doses d
       JOIN medications m ON d.medication_id = m.id
       WHERE d.scheduled_date >= ? AND d.user_id = ?
       GROUP BY m.id
       ORDER BY m.name`
    )
    .all(fromStr, userId) as any[];

  // Symptoms
  const symptoms = db
    .prepare(
      `SELECT s.name, s.severity, s.logged_at, s.notes, m.name as medication_name
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.logged_at >= ? AND s.user_id = ?
       ORDER BY s.logged_at DESC`
    )
    .all(fromStr, userId) as any[];

  // All medications
  const medications = db
    .prepare("SELECT name, dosage, frequency, instructions, prescribing_doctor FROM medications WHERE user_id = ? ORDER BY name")
    .all(userId) as any[];

  // Upcoming appointments
  const today = new Date().toISOString().slice(0, 10);
  const appointments = db
    .prepare("SELECT title, doctor_name, location, date, time FROM appointments WHERE date >= ? AND user_id = ? ORDER BY date ASC, time ASC LIMIT 5")
    .all(today, userId) as any[];

  const appointmentList = appointments.length > 0
    ? appointments.map((a: any) => `- ${a.date} ${a.time ? 'at ' + a.time : ''}: ${a.title}${a.doctor_name ? ' with ' + a.doctor_name : ''}${a.location ? ' @ ' + a.location : ''}`).join("\n")
    : "No upcoming appointments.";

  const medList = medAdherence
    .map(
      (m) =>
        `- ${m.name} ${m.dosage}: ${m.frequency}. ${m.total} doses scheduled, ${m.taken} taken, ${
          m.missed
        } missed (${m.total > 0 ? Math.round((m.taken / (m.taken + m.missed || 1)) * 100) : "N/A"}% adherence)`
    )
    .join("\n");

  const symptomTimeline =
    symptoms.length > 0
      ? symptoms
          .map((s) => `- ${s.logged_at.slice(0, 16)}: ${s.name} (${s.severity}/5)${s.medication_name ? ` — near ${s.medication_name}` : ""}${s.notes ? `. Note: ${s.notes}` : ""}`)
          .join("\n")
      : "No symptoms recorded.";

  const userMessage = `Create a structured doctor visit report based on the past ${days} days of my medication data.

Medication List with Adherence:
${medList}

Symptom Timeline:
${symptomTimeline}

Upcoming Appointments:
${appointmentList}

Please generate a report with these sections:

1. **Current Medications** — list with dosage, frequency, and adherence
2. **Adherence Summary** — overall assessment
3. **Symptoms Timeline** — any patterns or notable changes
4. **Upcoming Appointments** — list and suggest what to discuss
5. **Questions to Ask Your Doctor** — 3-5 specific questions based on the data and upcoming appointments
6. **Disclaimer** — remind that this is not medical advice

Keep it under 500 words. Use a clear, professional yet patient-friendly tone.`;

  const answer = await chat([{ role: "user", content: userMessage }], {
    temperature: 0.3,
  });

  // Auto-save the report
  const title = `Doctor Visit Report — ${new Date().toLocaleDateString()}`;
  try {
    db.prepare(
      "INSERT INTO reports (user_id, title, content, report_type) VALUES (?, ?, ?, ?)"
    ).run(userId, title, answer, "doctor-report");
  } catch {
    // Silently fail — don't break the response if save fails
  }

  res.json({
    answer,
    data: {
      days,
      medications: medAdherence,
      symptoms: symptoms.length,
    },
  });
});

// POST /api/ai/symptom-insights — analyze symptom-medication correlations
router.post("/ai/symptom-insights", async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const days = parseInt((req.query.days as string) || "60", 10);
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: "days must be between 1 and 365" });
    return;
  }

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const fromStr = fromDate.toISOString().slice(0, 10);

  // Get symptoms with their timestamps and linked medications
  const symptoms = db
    .prepare(
      `SELECT s.name as symptom_name, s.severity, s.logged_at, s.notes,
              m.name as medication_name, m.dosage, m.frequency
       FROM symptoms s
       LEFT JOIN medications m ON s.medication_id = m.id
       WHERE s.logged_at >= ? AND s.user_id = ?
       ORDER BY s.logged_at DESC`
    )
    .all(fromStr, userId) as any[];

  // Get medications
  const medications = db
    .prepare("SELECT name, dosage, frequency FROM medications WHERE user_id = ? ORDER BY name")
    .all(userId) as any[];

  if (symptoms.length === 0) {
    res.json({
      answer: "You haven't logged any symptoms in this period. Start logging symptoms to get insights about possible medication-symptom correlations.",
      correlations: [],
    });
    return;
  }

  const symptomEntries = symptoms
    .map(
      (s) =>
        `- ${s.logged_at.slice(0, 16)}: "${s.symptom_name}" (severity ${s.severity}/5)${
          s.medication_name ? ` — linked to ${s.medication_name} (${s.dosage})` : " — no medication linked"
        }${s.notes ? `. Notes: ${s.notes}` : ""}`
    )
    .join("\n");

  const medList = medications
    .map((m) => `- ${m.name} ${m.dosage} (${m.frequency})`)
    .join("\n");

  const userMessage = `Analyze my symptom log for possible medication-symptom correlations.

My medications:
${medList}

My symptoms over the past ${days} days:
${symptomEntries}

Please analyze this data and provide:

1. Any symptoms that appear to correlate with specific medications (e.g., "You logged headaches 3 times within 2 hours of taking Lisinopril")
2. Patterns in symptom severity or timing
3. Symptoms that appeared after starting or changing medications
4. Potential side effect patterns that match known medication profiles

Important guidelines:
- Be transparent about uncertainty — correlation doesn't equal causation
- Don't diagnose — frame everything as "possible patterns to discuss with your doctor"
- If no clear patterns emerge, say so honestly
- End with a strong recommendation to discuss these observations with their doctor

Keep it under 400 words.`;

  const answer = await chat([{ role: "user", content: userMessage }], {
    temperature: 0.3,
  });

  res.json({
    answer,
    data: {
      days,
      symptomCount: symptoms.length,
      medicationCount: medications.length,
    },
  });
});

export default router;
