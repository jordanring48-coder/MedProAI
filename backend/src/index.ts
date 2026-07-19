import express from "express";
import cors from "cors";
import path from "path";
import { authMiddleware } from "./middleware/auth.js";
import { isApiKeyConfigured } from "./ai.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import medicationsRouter from "./routes/medications.js";
import dosesRouter from "./routes/doses.js";
import statsRouter from "./routes/stats.js";
import symptomsRouter from "./routes/symptoms.js";
import aiRouter from "./routes/ai.js";
import appointmentsRouter from "./routes/appointments.js";
import drugRoutes from "./routes/drugs.js";
import profileRouter from "./routes/profile.js";

const app = express();
const PORT = process.env.MEDCHRON_PORT ? parseInt(process.env.MEDCHRON_PORT) : 3001;
const STATIC_DIR = process.env.STATIC_DIR || null;

app.use(cors());
app.use(express.json());

// ── Public routes (no auth required) ──
app.use("/api", authRouter);
app.use("/api", adminRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    ai: {
      keyConfigured: isApiKeyConfigured(),
      model: process.env.AI_MODEL || "gpt-4o-mini",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    }
  });
});

// ── Serve static frontend — these are public (middleware skips non-/api/ paths) ──
if (STATIC_DIR) {
  const staticPath = path.resolve(STATIC_DIR);
  app.use(express.static(staticPath));
  console.log(`Serving static files from ${staticPath}`);
}

// ── Auth middleware — only applies to /api/* routes, skips public ones ──
app.use(authMiddleware);

// ── Protected API routes ──
app.use("/api", dosesRouter);
app.use("/api", statsRouter);
app.use("/api", symptomsRouter);
app.use("/api", aiRouter);
app.use("/api/medications", medicationsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api", drugRoutes);
app.use("/api", authMiddleware, profileRouter);

// ── SPA fallback (after auth middleware — but auth skips non-/api/ paths) ──
if (STATIC_DIR) {
  const staticPath = path.resolve(STATIC_DIR);
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MedTrack AI API running on http://0.0.0.0:${PORT}`);
});

export default app;
