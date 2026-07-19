import type {
  Medication,
  MedicationFormData,
  Dose,
  AdherenceStats,
  Symptom,
  SymptomFormData,
  SymptomPattern,
  TimelineEntry,
  AIChatResponse,
  AIExplainResponse,
  AISummaryResponse,
  AIDoctorReportResponse,
  AISymptomInsightsResponse,
  Appointment,
  AppointmentFormData,
  DrugInfo,
  DrugSuggestion,
  MedicationInfoResponse,
  DetectActionResponse,
} from "./types";

const BASE = "/api/medications";
const TOKEN_KEY = "luna_token";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const msg = data.errors?.[0]?.message || data.error || "Request failed";
    const err = new Error(msg) as Error & { errors?: typeof data.errors; status: number };
    err.errors = data.errors;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = getAuthHeaders();
  // Remove Content-Type if body is not present (e.g. GET requests)
  if (!options.body) {
    delete headers["Content-Type"];
  }
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

export async function detectAction(question: string, context?: string): Promise<DetectActionResponse> {
  const res = await authFetch("/api/ai/detect-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context }),
  });
  return handleResponse<DetectActionResponse>(res);
}

export async function fetchMedications(): Promise<Medication[]> {
  const res = await authFetch(BASE);
  return handleResponse<Medication[]>(res);
}

export async function fetchMedication(id: number | string): Promise<Medication> {
  const res = await authFetch(`${BASE}/${id}`);
  return handleResponse<Medication>(res);
}

export async function createMedication(data: MedicationFormData): Promise<Medication> {
  const res = await authFetch(BASE, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return handleResponse<Medication>(res);
}

export async function updateMedication(
  id: number | string,
  data: MedicationFormData
): Promise<Medication> {
  const res = await authFetch(`${BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return handleResponse<Medication>(res);
}

export async function deleteMedication(id: number | string): Promise<void> {
  const res = await authFetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Delete failed");
  }
}

// ── Doses API ──

export async function fetchTodayDoses(date?: string): Promise<Dose[]> {
  const url = date ? `/api/doses/today?date=${encodeURIComponent(date)}` : "/api/doses/today";
  const res = await authFetch(url);
  return handleResponse<Dose[]>(res);
}

export async function fetchMedicationDoses(
  medId: number,
  date?: string
): Promise<Dose[]> {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const res = await authFetch(`/api/medications/${medId}/doses?date=${dateStr}`);
  return handleResponse<Dose[]>(res);
}

export async function fetchDoseHistory(
  from: string,
  to: string
): Promise<Dose[]> {
  const res = await authFetch(`/api/doses/history?from=${from}&to=${to}`);
  return handleResponse<Dose[]>(res);
}

export async function scheduleDoses(
  medicationId: number,
  frequency: string,
  startDate?: string,
  reminderTimes?: string[],
  timezoneOffset?: number
): Promise<{ generated: number }> {
  const res = await authFetch("/api/doses/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ medicationId, frequency, startDate, reminderTimes, timezoneOffset }),
  });
  return handleResponse<{ generated: number }>(res);
}

export async function updateDose(
  doseId: number,
  status: string,
  notes?: string
): Promise<Dose> {
  const res = await authFetch(`/api/doses/${doseId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes }),
  });
  return handleResponse<Dose>(res);
}

// ── Stats API ──

export async function fetchAdherenceStats(days: number = 30): Promise<AdherenceStats> {
  const res = await authFetch(`/api/stats/adherence?days=${days}`);
  return handleResponse<AdherenceStats>(res);
}

// ── Symptoms API ──

export async function fetchSymptoms(from?: string, to?: string): Promise<Symptom[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await authFetch(`/api/symptoms${qs ? "?" + qs : ""}`);
  return handleResponse<Symptom[]>(res);
}

export async function createSymptom(data: SymptomFormData): Promise<Symptom> {
  const res = await authFetch("/api/symptoms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Symptom>(res);
}

export async function updateSymptom(id: number, data: Partial<SymptomFormData>): Promise<Symptom> {
  const res = await authFetch(`/api/symptoms/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Symptom>(res);
}

export async function deleteSymptom(id: number): Promise<void> {
  const res = await authFetch(`/api/symptoms/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Delete failed");
  }
}

export async function fetchSymptomPatterns(days: number = 30): Promise<SymptomPattern[]> {
  const res = await authFetch(`/api/symptoms/patterns?days=${days}`);
  return handleResponse<SymptomPattern[]>(res);
}

export async function fetchCommonSymptoms(): Promise<string[]> {
  const res = await authFetch("/api/symptoms/common");
  return handleResponse<string[]>(res);
}

// ── Timeline API ──

export async function fetchTimeline(from?: string, to?: string): Promise<TimelineEntry[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await authFetch(`/api/timeline${qs ? "?" + qs : ""}`);
  return handleResponse<TimelineEntry[]>(res);
}

// ── AI Assistant API ──

export async function aiChat(question: string, context?: string): Promise<AIChatResponse> {
  const res = await authFetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context }),
  });
  return handleResponse<AIChatResponse>(res);
}

export async function aiExplain(medicationId: number): Promise<AIExplainResponse> {
  const res = await authFetch(`/api/ai/explain/${medicationId}`, { method: "POST" });
  return handleResponse<AIExplainResponse>(res);
}

export async function aiSummary(days: number = 30): Promise<AISummaryResponse> {
  const res = await authFetch(`/api/ai/summary?days=${days}`, { method: "POST" });
  return handleResponse<AISummaryResponse>(res);
}

export async function aiDoctorReport(days: number = 30): Promise<AIDoctorReportResponse> {
  const res = await authFetch(`/api/ai/doctor-report?days=${days}`, { method: "POST" });
  return handleResponse<AIDoctorReportResponse>(res);
}

export async function aiSymptomInsights(days: number = 60): Promise<AISymptomInsightsResponse> {
  const res = await authFetch(`/api/ai/symptom-insights?days=${days}`, { method: "POST" });
  return handleResponse<AISymptomInsightsResponse>(res);
}

// ── Refill API ──

export async function fetchRefillList(): Promise<Medication[]> {
  const res = await authFetch("/api/medications/refills");
  return handleResponse<Medication[]>(res);
}

// ── Appointments API ──

export async function fetchAppointments(): Promise<Appointment[]> {
  const res = await authFetch("/api/appointments");
  return handleResponse<Appointment[]>(res);
}

export async function fetchUpcomingAppointments(): Promise<Appointment[]> {
  const res = await authFetch("/api/appointments/upcoming");
  return handleResponse<Appointment[]>(res);
}

export async function createAppointment(data: AppointmentFormData): Promise<Appointment> {
  const res = await authFetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Appointment>(res);
}

export async function updateAppointment(id: number, data: AppointmentFormData): Promise<Appointment> {
  const res = await authFetch(`/api/appointments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<Appointment>(res);
}

export async function deleteAppointment(id: number): Promise<void> {
  const res = await authFetch(`/api/appointments/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Delete failed");
  }
}

// ── Medication Drug Info API ──

export async function lookupMedication(name: string): Promise<DrugInfo> {
  const res = await authFetch("/api/medications/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleResponse<DrugInfo>(res);
}

export async function fetchMedicationInfo(id: number | string): Promise<MedicationInfoResponse> {
  const res = await authFetch(`${BASE}/${id}/info`);
  return handleResponse<MedicationInfoResponse>(res);
}

// ── Drug Search API (RxNorm + DailyMed + openFDA) ──

export async function searchDrugs(q: string): Promise<{ suggestions: DrugSuggestion[]; error?: string }> {
  const res = await authFetch(`/api/drugs/search?q=${encodeURIComponent(q)}`);
  return handleResponse<{ suggestions: DrugSuggestion[]; error?: string }>(res);
}

export async function fetchDrugStrengths(rxcui: string): Promise<{ strengths: Array<{ name: string; rxcui: string; tty: string }> }> {
  const res = await authFetch(`/api/drugs/strengths?rxcui=${encodeURIComponent(rxcui)}`);
  return handleResponse<{ strengths: Array<{ name: string; rxcui: string; tty: string }> }>(res);
}

export async function fetchDrugInfo(rxcui: string, name: string): Promise<any> {
  const res = await authFetch(`/api/drugs/info?rxcui=${rxcui}&name=${encodeURIComponent(name)}`);
  return handleResponse<any>(res);
}

// ── Profile API ──

export async function updateProfile(token: string, data: { avatarColor?: string }): Promise<any> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

// ── Allergies API ──

export async function fetchAllergies(): Promise<{ allergies: Array<{ id: number; name: string }> }> {
  const res = await authFetch("/api/allergies");
  return handleResponse<{ allergies: Array<{ id: number; name: string }> }>(res);
}

export async function createAllergy(name: string): Promise<{ id: number; name: string }> {
  const res = await authFetch("/api/allergies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return handleResponse<{ id: number; name: string }>(res);
}

export async function deleteAllergy(id: number): Promise<void> {
  const res = await authFetch(`/api/allergies/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Delete failed");
  }
}

// ── Providers API ──

export async function fetchProviders(): Promise<{ providers: Array<import("./types").Provider> }> {
  const res = await authFetch("/api/providers");
  return handleResponse<{ providers: Array<import("./types").Provider> }>(res);
}

export async function createProvider(data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  specialty?: string;
}): Promise<import("./types").Provider> {
  const res = await authFetch("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<import("./types").Provider>(res);
}

export async function updateProvider(
  id: number,
  data: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    specialty?: string;
  }
): Promise<import("./types").Provider> {
  const res = await authFetch(`/api/providers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse<import("./types").Provider>(res);
}

export async function deleteProvider(id: number): Promise<void> {
  const res = await authFetch(`/api/providers/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Delete failed");
  }
}
