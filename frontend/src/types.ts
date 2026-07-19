export interface Medication {
  id: number;
  name: string;
  dosage: string;
  quantity?: string;
  frequency: string;
  prescribing_doctor: string;
  refill_date: string;
  instructions: string;
  refill_status: string | null;
  refill_requested_at: string | null;
  reminder_times: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicationFormData {
  name: string;
  dosage: string;
  quantity: string;
  frequency: string;
  prescribing_doctor: string;
  refill_date: string;
  instructions: string;
  reminder_times?: string | null;
}

export interface Dose {
  id: number;
  medication_id: number;
  scheduled_date: string;
  scheduled_time: string;
  status: "pending" | "taken" | "missed" | "skipped";
  taken_at: string | null;
  notes: string;
  created_at: string;
  medication_name?: string;
  medication_dosage?: string;
  medication_frequency?: string;
}

export interface AdherenceStats {
  days: number;
  from: string;
  total: number;
  taken: number;
  missed: number;
  skipped: number;
  pending: number;
  adherence: number; // -1 means no evaluable dose history
  totalMedications: number;
  streak: number;
  streakStartDate: string | null;
  allTakenToday: boolean;
}

export interface Symptom {
  id: number;
  name: string;
  severity: number;
  notes: string;
  logged_at: string;
  medication_id: number | null;
  medication_name: string | null;
  created_at: string;
}

export interface SymptomFormData {
  name: string;
  severity: number;
  notes?: string;
  logged_at?: string;
  medication_id?: number | null;
}

export interface SymptomPattern {
  name: string;
  count: number;
  avgSeverity: number;
}

export interface TimelineEntry {
  type: "dose" | "symptom";
  id: string;
  timestamp: string;
  // dose fields
  medication_name?: string;
  medication_id?: number;
  dosage?: string;
  status?: string;
  taken_at?: string | null;
  scheduled_time?: string;
  scheduled_date?: string;
  notes?: string;
  // symptom fields
  name?: string;
  severity?: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export type RefillStatus = "green" | "orange" | "red";

export function getRefillStatus(refillDate: string): RefillStatus {
  if (!refillDate) return "green";
  const now = new Date();
  const refill = new Date(refillDate);
  const diffDays = Math.ceil((refill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "red";
  if (diffDays <= 7) return "red";
  if (diffDays <= 30) return "orange";
  return "green";
}

export interface AIAnswer {
  answer: string;
}

export interface AIChatResponse {
  answer: string;
}

export interface AIExplainResponse {
  answer: string;
  medication: Medication;
}

export interface AISummaryResponse {
  answer: string;
  stats: {
    days: number;
    total: number;
    taken: number;
    missed: number;
    skipped: number;
    pending: number;
    adherence: number;
  };
}

export interface AIDoctorReportResponse {
  answer: string;
  data: {
    days: number;
    medications: any[];
    symptoms: number;
  };
}

export interface AISymptomInsightsResponse {
  answer: string;
  data?: {
    days: number;
    symptomCount: number;
    medicationCount: number;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function getRefillLabel(refillDate: string): string {
  if (!refillDate) return "No refill date set";
  const now = new Date();
  const refill = new Date(refillDate);
  const diffDays = Math.ceil((refill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`;
  if (diffDays === 0) return "Refill today";
  if (diffDays === 1) return "Refill tomorrow";
  return `Refill in ${diffDays} days`;
}

export interface Appointment {
  id: number;
  title: string;
  doctor_name: string;
  location: string;
  date: string;
  time: string;
  notes: string;
  created_at: string;
}

export interface AppointmentFormData {
  title: string;
  doctor_name: string;
  location: string;
  date: string;
  time: string;
  notes: string;
}

export interface Allergy {
  id: number;
  name: string;
}

export interface Provider {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  specialty: string;
}

export interface SavedReport {
  id: number;
  title: string;
  content: string;
  report_type: string;
  created_at: string;
}

export interface PremiumState {
  active: boolean;
  upgradedAt: string;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  is_premium: number;
  premium_since: string | null;
  avatarColor?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface DrugInfo {
  brandName: string;
  genericName: string;
  activeIngredients: string[];
  purpose: string;
  uses: string;
  warnings: string[];
  commonSideEffects: string[];
  dosageForms: string[];
  source: string;
}

export interface DrugSuggestion {
  name: string;
  rxcui: string;
  tty: string;
}

export interface MedicationInfoResponse {
  medication: Medication;
  fda: DrugInfo | null;
}

// ── AI Action Detection ──

export interface ActionMedicationData {
  name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
}

export interface ActionSymptomData {
  name?: string;
  severity?: number;
  notes?: string;
}

export interface ActionAppointmentData {
  title?: string;
  doctor_name?: string;
  date?: string;
  time?: string;
  location?: string;
  notes?: string;
}

export type ActionData = ActionMedicationData | ActionSymptomData | ActionAppointmentData;

export interface DetectedAction {
  intent: "add_medication" | "add_symptom" | "add_appointment";
  data: ActionData;
}

export interface DetectActionResponse {
  action: DetectedAction | null;
}
