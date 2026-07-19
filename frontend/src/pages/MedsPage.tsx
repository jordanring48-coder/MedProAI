import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Medication, Dose, Symptom, SymptomPattern, TimelineEntry } from "../types";
import { getRefillStatus, getRefillLabel } from "../types";
import { fetchMedications, fetchTodayDoses, updateDose, fetchSymptoms, fetchSymptomPatterns, fetchTimeline } from "../api";
import AddEditMedicationModal from "../components/AddEditMedicationModal";
import LogSymptomModal from "../components/LogSymptomModal";
import usePremium from "../hooks/usePremium";
import UserAvatar from "../components/UserAvatar";

const refillColors = {
  green: { dot: "bg-[#34D399]", ring: "ring-[#34D399]/20", border: "border-l-[#34D399]" },
  orange: { dot: "bg-[#FBBF24]", ring: "ring-[#FBBF24]/20", border: "border-l-[#FBBF24]" },
  red: { dot: "bg-[#F87171]", ring: "ring-[#F87171]/20", border: "border-l-[#F87171]" },
};

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function isPastTime(time: string): boolean {
  return time < nowTime();
}

function localDateStr(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function relativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return "";
}

function groupByDate(entries: any[]): { label: string; date: string; entries: any[] }[] {
  const groups: Record<string, any[]> = {};
  const now = new Date();
  const today = localDateStr(now.toISOString());
  const yesterday = localDateStr(new Date(now.getTime() - 86400000).toISOString());

  for (const entry of entries) {
    const dateStr = localDateStr(entry.timestamp);
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(entry);
  }

  return Object.entries(groups).map(([date, entries]) => {
    let label: string;
    if (date === today) label = "Today";
    else if (date === yesterday) label = "Yesterday";
    else {
      label = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    return { label, date, entries };
  });
}

export default function MedsPage() {
  const navigate = useNavigate();
  const { isPremium } = usePremium();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [todayDoses, setTodayDoses] = useState<Dose[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSymptomModal, setShowSymptomModal] = useState(false);
  const [viewMode, setViewMode] = useState<"meds" | "symptoms" | "timeline">("meds");
  const [flashingMeds, setFlashingMeds] = useState<Set<number>>(new Set());
  const [patterns, setPatterns] = useState<SymptomPattern[]>([]);
  const [timelineGroups, setTimelineGroups] = useState<{ label: string; date: string; entries: (TimelineEntry & { medCreatedAt?: string; medDosage?: string; medFrequency?: string })[] }[]>([]);
  const [tlLoading, setTlLoading] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [medsData, dosesData] = await Promise.all([
        fetchMedications(),
        fetchTodayDoses(),
      ]);
      setMeds(medsData);
      setTodayDoses(dosesData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load medications");
    } finally {
      setLoading(false);
    }

    // Fetch symptom patterns (non-blocking)
    try {
      const pats = await fetchSymptomPatterns(30);
      setPatterns(pats);
    } catch {
      // Silently fail — patterns are supplementary
    }
  };

  const loadSymptoms = async () => {
    try {
      const syms = await fetchSymptoms();
      setSymptoms(syms);
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (viewMode === "symptoms") {
      loadSymptoms();
    }
    if (viewMode === "timeline") {
      loadTimeline();
    }
  }, [viewMode]);

  const loadTimeline = async () => {
    setTlLoading(true);
    setTlError(null);
    try {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const entries = await fetchTimeline(from, to);

      // Create "medication_added" entries from medications data
      const medAddedEntries = meds.map((med) => ({
        type: "medication_added" as const,
        id: `med-added-${med.id}`,
        timestamp: med.created_at,
        medication_name: med.name,
        medication_id: med.id,
        dosage: med.dosage,
        medDosage: med.dosage,
        medFrequency: med.frequency,
      }));

      // Merge all entries and sort by timestamp descending
      const allEntries = [...entries, ...medAddedEntries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Slice to 20 most recent
      const recent = allEntries.slice(0, 20);

      // Group by date
      const grouped = groupByDate(recent);
      setTimelineGroups(grouped);
    } catch (err: any) {
      setTlError(err.message || "Failed to load timeline");
    } finally {
      setTlLoading(false);
    }
  };

  const handleSaved = () => {
    setShowModal(false);
    loadData();
    // Reload timeline if it's the active view (new meds affect timeline)
    if (viewMode === "timeline") {
      // Re-fetch after meds state has settled
      setTimeout(() => loadTimeline(), 100);
    }
  };

  const handleDoseUpdate = async (dose: Dose, newStatus: "pending" | "taken" | "missed" | "skipped") => {
    // Optimistic update
    setTodayDoses((prev) =>
      prev.map((d) => (d.id === dose.id ? { ...d, status: newStatus } : d))
    );
    try {
      await updateDose(dose.id, newStatus);
    } catch {
      // Revert on failure
      setTodayDoses((prev) =>
        prev.map((d) => (d.id === dose.id ? { ...d, status: dose.status } : d))
      );
    }
  };

  const handleMarkAllTaken = async (medicationId: number, doses: Dose[]) => {
    const pendingDoses = doses.filter((d) => d.status === "pending");
    if (pendingDoses.length === 0) return;

    // Optimistic update
    setTodayDoses((prev) =>
      prev.map((d) =>
        d.medication_id === medicationId && d.status === "pending"
          ? { ...d, status: "taken" as const }
          : d
      )
    );

    // Flash effects
    setFlashingMeds((prev) => new Set(prev).add(medicationId));
    setTimeout(() => {
      setFlashingMeds((prev) => {
        const next = new Set(prev);
        next.delete(medicationId);
        return next;
      });
    }, 800);

    // Fire all updates
    try {
      await Promise.all(pendingDoses.map((d) => updateDose(d.id, "taken")));
    } catch {
      // Revert on failure
      loadData();
    }
  };

  // Group today's doses by medication
  const dosesByMed: Record<string, Dose[]> = {};
  for (const dose of todayDoses) {
    const key = dose.medication_name || `Med #${dose.medication_id}`;
    if (!dosesByMed[key]) dosesByMed[key] = [];
    dosesByMed[key].push(dose);
  }

  const totalToday = todayDoses.length;
  const takenToday = todayDoses.filter((d) => d.status === "taken").length;
  const missedToday = todayDoses.filter((d) => {
    if (d.status === "missed") return true;
    if (d.status === "pending" && isPastTime(d.scheduled_time)) return true;
    return false;
  }).length;

  return (
    <div className="pb-24 min-h-screen">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-[#2DE2A0]/20 to-transparent pt-14 pb-4 px-5">
        <div className="absolute right-5 top-3">
          <UserAvatar />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#2DE2A0]/10 rounded-xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[#FAFAFA] tracking-tight">Tracker</h1>
        </div>
        <p className="text-[15px] text-[#71717A] mt-1.5 ml-[42px]">Track your medications, symptoms & timeline</p>
      </div>

      <div className="px-5">
      {/* View toggle — Premium feature */}
      {isPremium && (
        <div className="flex bg-[#1C1C1F] rounded-xl p-1 mb-5">
          <button
            onClick={() => setViewMode("meds")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              viewMode === "meds" ? "bg-[#161618] text-[#FAFAFA] shadow-sm" : "text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            Medications
          </button>
          <button
            onClick={() => setViewMode("symptoms")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              viewMode === "symptoms" ? "bg-[#161618] text-[#FAFAFA] shadow-sm" : "text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            Symptoms
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              viewMode === "timeline" ? "bg-[#161618] text-[#FAFAFA] shadow-sm" : "text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            Timeline
          </button>
        </div>
      )}

      {/* ── SYMPTOMS VIEW ── */}
      {viewMode === "symptoms" && isPremium && (
        <div className="space-y-3 pb-20">
          {symptoms.length === 0 ? (
            <div className="bg-[#161618] rounded-3xl p-8 text-center border border-[#27272A] shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              <p className="text-[#A1A1AA]">No symptoms logged yet.</p>
              <p className="text-sm text-[#71717A] mt-1">Tap the cyan + button to log your first symptom.</p>
            </div>
          ) : (
            symptoms.map((s) => {
              const sevLabel = s.severity <= 2 ? "Mild" : s.severity === 3 ? "Moderate" : s.severity === 4 ? "Strong" : "Severe";
              const sevColor = s.severity <= 2 ? "#34D399" : s.severity <= 3 ? "#FBBF24" : "#F87171";
              return (
                <div
                  key={s.id}
                  className="bg-[#161618] rounded-2xl p-5 border border-[#27272A] hover:border-[#3F3F46] transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${sevColor}15` }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={sevColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[#FAFAFA] text-[17px]">{s.name}</h3>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${sevColor}15`, color: sevColor }}
                        >
                          {sevLabel}
                        </span>
                      </div>
                      {s.notes && (
                        <p className="text-sm text-[#A1A1AA] mt-1 line-clamp-2">{s.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-[#71717A]">{relativeTime(s.logged_at)}</span>
                        <span className="text-[#3F3F46]">•</span>
                        <span className="text-xs text-[#71717A]">{localDateStr(s.logged_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Symptom Patterns */}
          {patterns.length > 0 && (
            <div className="bg-[#161618] rounded-2xl border border-[#27272A] p-6 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FBBF24" className="w-5 h-5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                <h2 className="text-[17px] font-semibold text-[#FAFAFA]">Symptom Patterns</h2>
                <span className="text-xs text-[#71717A]">30 days</span>
              </div>
              <div className="space-y-3">
                {patterns.slice(0, 5).map((p) => {
                  const maxCount = patterns[0]?.count || 1;
                  const barWidth = Math.max((p.count / maxCount) * 100, 8);
                  const sevColor =
                    p.avgSeverity <= 2
                      ? "#34D399"
                      : p.avgSeverity <= 3
                      ? "#FBBF24"
                      : "#F87171";
                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[15px] font-medium text-[#FAFAFA]">
                            {p.name}
                          </span>
                          <span className="text-sm text-[#A1A1AA]">
                            {p.count}x
                          </span>
                        </div>
                        <div className="w-full bg-[#27272A] rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: sevColor,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-[#71717A]">
                            Avg severity
                          </span>
                          <span
                            className="text-xs font-semibold"
                            style={{ color: sevColor }}
                          >
                            {p.avgSeverity}/5
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {viewMode === "timeline" && isPremium && (
        <>
        {/* Loading */}
        {tlLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#161618] rounded-2xl p-4 border border-[#27272A] animate-pulse">
                <div className="h-4 bg-[#27272A] rounded w-24 mb-4" />
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-9 h-9 bg-[#27272A] rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-[#27272A] rounded w-3/4" />
                      <div className="h-3 bg-[#1C1C1F] rounded w-1/2" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!tlLoading && tlError && (
          <div className="bg-[#161618] rounded-2xl p-6 border border-[#27272A] text-center">
            <p className="text-[#F87171] text-sm mb-2">{tlError}</p>
            <button
              onClick={loadTimeline}
              className="text-[#2DE2A0] font-medium hover:underline text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!tlLoading && !tlError && timelineGroups.length === 0 && (
          <div className="bg-[#161618] rounded-2xl p-8 border border-[#27272A] text-center">
            <div className="w-16 h-16 bg-[#2DE2A0]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="font-semibold text-[#FAFAFA] mb-1">No activity yet</h3>
            <p className="text-sm text-[#A1A1AA]">
              Doses and logged symptoms will appear here as they happen.
            </p>
          </div>
        )}

        {/* Timeline grouped by date */}
        {!tlLoading && !tlError && timelineGroups.length > 0 && (
          <div className="space-y-3 pb-20">
            {timelineGroups.map((group) => (
              <div key={group.date} className="bg-[#161618] rounded-2xl border border-[#27272A] overflow-hidden">
                {/* Date header */}
                <div className="px-4 py-3 border-b border-[#27272A]">
                  <h2 className="text-sm font-semibold text-[#A1A1AA]">
                    {group.label}
                    <span className="text-xs text-[#71717A] ml-2">
                      {group.entries.length} item{group.entries.length !== 1 ? "s" : ""}
                    </span>
                  </h2>
                </div>

                {/* Entries */}
                <div className="divide-y divide-[#27272A]">
                  {group.entries.map((entry: any) => {
                    // Dose entry
                    if (entry.type === "dose") {
                      const status = entry.status || "pending";
                      const isTaken = status === "taken";
                      const isMissed = status === "missed";
                      return (
                        <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                          {isTaken ? (
                            <div className="w-9 h-9 bg-[#34D399]/10 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          ) : isMissed ? (
                            <div className="w-9 h-9 bg-[#F87171]/10 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-9 h-9 bg-[#27272A] rounded-full flex items-center justify-center flex-shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <polyline points="6 6 12 12 6 18" />
                                <polyline points="14 6 18 12 14 18" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-medium text-[#FAFAFA] truncate">
                                {entry.medication_name || `Medication #${entry.medication_id}`}
                              </span>
                              {entry.dosage && (
                                <span className="text-xs text-[#71717A]">{entry.dosage}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm text-[#A1A1AA]">{entry.scheduled_time}</span>
                              <span className="text-[#3F3F46]">•</span>
                              <span
                                className={`text-xs font-medium ${
                                  isTaken ? "text-[#34D399]" : isMissed ? "text-[#F87171]" : "text-[#A1A1AA]"
                                }`}
                              >
                                {isTaken ? "Taken" : isMissed ? "Missed" : status === "skipped" ? "Skipped" : "Pending"}
                              </span>
                              <span className="text-[#3F3F46]">•</span>
                              <span className="text-xs text-[#71717A]">{relativeTime(entry.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Symptom entry
                    if (entry.type === "symptom") {
                      const sev = entry.severity || 1;
                      const sevLabel = sev <= 2 ? "Mild" : sev === 3 ? "Moderate" : sev === 4 ? "Strong" : "Severe";
                      const sevColor = sev <= 2 ? "#34D399" : sev <= 3 ? "#FBBF24" : "#F87171";
                      return (
                        <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${sevColor}15` }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={sevColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-medium text-[#FAFAFA]">{entry.name}</span>
                              <span className="text-xs text-[#71717A]">{sevLabel}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-[#71717A]">{relativeTime(entry.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Medication added entry
                    return (
                      <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#2DE2A0]/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-medium text-[#FAFAFA] truncate">
                              {entry.medication_name || `Medication #${entry.medication_id}`}
                            </span>
                            <span className="text-xs text-[#2DE2A0] bg-[#2DE2A0]/10 px-2 py-0.5 rounded-full font-medium">
                              Added
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[#71717A]">{relativeTime(entry.timestamp)}</span>
                            {entry.medDosage && (
                              <>
                                <span className="text-[#3F3F46]">•</span>
                                <span className="text-xs text-[#71717A]">{entry.medDosage}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
      )}

      {/* ── MEDS VIEW ── */}
      {viewMode === "meds" && (
      <>
      {/* Today's Doses Card */}
      {!loading && todayDoses.length > 0 && (
        <div className="bg-[#161618] rounded-3xl border border-[#27272A] p-5 mb-5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[17px] font-semibold text-[#FAFAFA] tracking-tight">Today</h2>
            <span className="text-sm text-[#A1A1AA]">
              {takenToday} of {totalToday} taken
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#27272A] rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="h-2 bg-[#34D399] rounded-full transition-all duration-300"
              style={{ width: `${totalToday > 0 ? (takenToday / totalToday) * 100 : 0}%` }}
            />
          </div>

          {/* Doses grouped by medication */}
          <div className="space-y-3">
            {Object.entries(dosesByMed).map(([medName, doses]) => {
              const medId = doses[0]?.medication_id;
              const allTaken = doses.every((d) => d.status === "taken");
              const hasPending = doses.some((d) => d.status === "pending");
              const isFlashing = medId ? flashingMeds.has(medId) : false;

              return (
              <div key={medName} className="bg-[#1C1C1F]/60 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#2DE2A0]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-medium text-[#FAFAFA]">{medName}</span>
                  {doses[0]?.medication_frequency && (
                    <span className="text-xs text-[#A1A1AA]">{doses[0].medication_frequency}</span>
                  )}
                  {doses[0]?.medication_dosage && (
                    <span className="text-xs text-[#71717A]">{doses[0].medication_dosage}</span>
                  )}
                  <div className="flex-1" />
                  {/* Circular check-all checkbox */}
                  {hasPending ? (
                    <button
                      onClick={() => medId && handleMarkAllTaken(medId, doses)}
                      className="w-7 h-7 rounded-full border-2 border-[#3F3F46] bg-transparent hover:border-[#2DE2A0] active:scale-90 transition-all duration-150 cursor-pointer flex-shrink-0"
                      aria-label={`Mark all ${medName} as taken`}
                    />
                  ) : allTaken ? (
                    <div className={`w-7 h-7 rounded-full bg-[#2DE2A0] flex items-center justify-center flex-shrink-0 ${isFlashing ? 'shadow-[0_0_12px_rgba(45,226,160,0.5)] ring-2 ring-[#2DE2A0]/30 animate-[checkPop_0.3s_ease-out]' : ''}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {doses.map((dose) => {
                    const displayMissed =
                      dose.status === "pending" && isPastTime(dose.scheduled_time);
                    const effectiveStatus =
                      dose.status === "pending" && isPastTime(dose.scheduled_time)
                        ? "missed"
                        : dose.status;
                    const isTaken = effectiveStatus === "taken";

                    return (
                      <button
                        key={dose.id}
                        onClick={() => {
                          if (isTaken) {
                            handleDoseUpdate(dose, "pending");
                          } else {
                            handleDoseUpdate(dose, "taken");
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 active:scale-[0.97] ${
                          isTaken
                            ? "bg-[#34D399]/10 text-[#34D399] line-through shadow-[0_0_8px_rgba(52,211,153,0.15)]"
                            : effectiveStatus === "missed"
                            ? "bg-[#F87171]/10 text-[#F87171]"
                            : effectiveStatus === "skipped"
                            ? "bg-[#27272A] text-[#71717A] line-through"
                            : "bg-[#1C1C1F] text-[#A1A1AA] border border-[#27272A] hover:border-[#2DE2A0] hover:text-[#2DE2A0]"
                        }`}
                      >
                        {isTaken ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                        ) : effectiveStatus === "missed" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                          </svg>
                        ) : null}
                        {dose.scheduled_time}
                      </button>
                    );
                  })}
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#161618] rounded-3xl p-5 border border-[#27272A] animate-pulse shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#27272A] rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[#27272A] rounded w-1/2" />
                  <div className="h-3 bg-[#1C1C1F] rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="bg-[#161618] rounded-3xl p-8 border border-[#27272A] text-center shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
          <div className="w-16 h-16 bg-[#F87171]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[#FAFAFA] font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-[#A1A1AA] mb-4">{error}</p>
          <button
            onClick={loadData}
            className="text-[#2DE2A0] font-medium hover:underline"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && meds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-24 h-24 bg-[#2DE2A0]/10 rounded-3xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
              <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#FAFAFA] mb-2 tracking-tight">No medications yet</h2>
          <p className="text-[15px] text-[#A1A1AA] text-center max-w-xs mb-8">
            Tap the + button to add your first medication and start tracking your health.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-[#2DE2A0] text-white font-semibold text-[17px] py-3.5 px-8 rounded-2xl btn-glow hover:bg-[#24B882] active:scale-[0.98] transition-all duration-200"
          >
            Add Medication
          </button>
        </div>
      )}

      {/* Medication list */}
      {!loading && !error && meds.length > 0 && (
        <div className="space-y-3 pb-20">
          {meds.map((med) => {
            const status = getRefillStatus(med.refill_date);
            const colors = refillColors[status];
            return (
              <button
                key={med.id}
                onClick={() => navigate(`/medications/${med.id}`)}
                className={`w-full text-left bg-[#161618] rounded-2xl p-5 border border-[#27272A] hover:border-[#3F3F46] active:scale-[0.99] transition-all duration-200 shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${
                  med.refill_date ? `border-l-2 ${colors.border}` : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Pill icon */}
                  <div className="w-12 h-12 bg-[#2DE2A0]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2DE2A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                      <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#FAFAFA] text-[17px] truncate">
                      {med.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {med.dosage && (
                        <span className="text-sm text-[#A1A1AA]">{med.dosage}</span>
                      )}
                      {med.dosage && (med.quantity || med.frequency) && (
                        <span className="text-[#3F3F46]">•</span>
                      )}
                      {med.quantity && (
                        <span className="text-sm text-[#A1A1AA]">Qty: {med.quantity}</span>
                      )}
                      {med.quantity && med.frequency && (
                        <span className="text-[#3F3F46]">•</span>
                      )}
                      {med.frequency && (
                        <span className="text-sm text-[#A1A1AA]">{med.frequency}</span>
                      )}
                    </div>
                  </div>

                  {/* Refill indicator */}
                  {med.refill_date && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className={`w-2.5 h-2.5 ${colors.dot} rounded-full ring-2 ${colors.ring}`} />
                      <span className="text-xs text-[#71717A]">
                        {status === "red" ? "Soon" : status === "orange" ? "Upcoming" : "OK"}
                      </span>
                    </div>
                  )}

                  {/* Chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#3F3F46] flex-shrink-0">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

                {/* Refill label below */}
                {med.refill_date && (
                  <div className="mt-3 pt-3 border-t border-[#27272A]">
                    <p className={`text-xs font-medium ${
                      status === "red" ? "text-[#F87171]" :
                      status === "orange" ? "text-[#FBBF24]" :
                      "text-[#34D399]"
                    }`}>
                      {getRefillLabel(med.refill_date)}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      </>
      )}
      </div>

      {/* FAB — floating action button */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-[#2DE2A0] text-white rounded-2xl flex items-center justify-center btn-glow hover:bg-[#24B882] active:scale-95 transition-all duration-200 z-40"
        aria-label="Add medication"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-7 h-7">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Log Symptom FAB */}
      <button
        onClick={() => setShowSymptomModal(true)}
        className="fixed bottom-24 right-20 w-14 h-14 bg-[#22D3EE] text-[#0A0A0B] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:bg-[#06B6D4] active:scale-95 transition-all duration-200 z-40"
        aria-label="Log symptom"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      </button>

      {/* Add/Edit modal */}
      {showModal && (
        <AddEditMedicationModal
          medication={null}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Log symptom modal */}
      {showSymptomModal && (
        <LogSymptomModal
          onClose={() => setShowSymptomModal(false)}
          onSaved={() => {
            setShowSymptomModal(false);
          }}
        />
      )}
    </div>
  );
}
