import { formatTime12h } from "../utils";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { TimelineEntry } from "../types";
import { fetchTimeline, fetchMedications } from "../api";

interface Group {
  label: string;
  date: string;
  entries: TimelineEntry[];
}

function localDateStr(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupByDate(entries: TimelineEntry[]): Group[] {
  const groups: Record<string, TimelineEntry[]> = {};
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

function DoseIcon({ status }: { status: string }) {
  switch (status) {
    case "taken":
      return (
        <div className="w-9 h-9 bg-[#BC25F9]/10 rounded-full flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    case "missed":
      return (
        <div className="w-9 h-9 bg-[#F87171]/10 rounded-full flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      );
    case "skipped":
      return (
        <div className="w-9 h-9 bg-[var(--bg-tertiary)] rounded-full flex items-center justify-center flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <polyline points="6 6 12 12 6 18" />
            <polyline points="14 6 18 12 14 18" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-9 h-9 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center flex-shrink-0">
          <div className="w-2.5 h-2.5 bg-[#71717A] rounded-full" />
        </div>
      );
  }
}

function SeverityBar({ severity }: { severity: number }) {
  const colors = ["#34D399", "#34D399", "#FBBF24", "#FBBF24", "#F87171"];
  return (
    <div className="flex gap-0.5 mt-1">
      {[1, 2, 3, 4, 5].map((level) => (
        <div
          key={level}
          className="h-1.5 w-4 rounded-full transition-colors"
          style={{
            backgroundColor: level <= severity ? colors[severity - 1] : "var(--bg-tertiary)",
          }}
        />
      ))}
    </div>
  );
}

function SymptomIcon({ severity }: { severity: number }) {
  const color = severity <= 2 ? "#34D399" : severity <= 3 ? "#FBBF24" : severity <= 4 ? "#FBBF24" : "#F87171";
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: `${color}15` }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  );
}

export default function TimelinePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMeds, setHasMeds] = useState<boolean | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const location = useLocation();

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      const [entries, meds] = await Promise.all([
        fetchTimeline(from, to),
        fetchMedications().catch(() => [] as any[]),
      ]);
      const grouped = groupByDate(entries);
      setGroups(grouped);
      setHasMeds(meds.length > 0);

      // Auto-expand today
      const today = localDateStr(new Date().toISOString());
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        // Expand today and yesterday by default
        grouped.forEach((g) => {
          if (g.date === today) next.add(g.date);
        });
        const yesterday = localDateStr(new Date(Date.now() - 86400000).toISOString());
        if (grouped.some((g) => g.date === yesterday)) {
          next.add(yesterday);
        }
        return next;
      });

      setError(null);
    } catch (err: any) {
      console.error("TimelinePage: failed to load timeline", err);
      setError(err.message || "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.pathname === "/timeline") {
      loadTimeline();
    }
  }, [location.pathname]);

  useEffect(() => {
    const onFocus = () => {
      if (location.pathname === "/timeline") {
        loadTimeline();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [location.pathname]);

  const toggleGroup = (date: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const hasData = groups.length > 0;

  return (
    <div className="p-5 pt-14 pb-24 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1 tracking-tight">Timeline</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Doses & symptoms in one view</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[var(--bg-secondary)] rounded-3xl p-4 border border-[#BC25F9]/25 animate-pulse">
              <div className="h-4 bg-[var(--bg-tertiary)] rounded w-24 mb-4" />
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-9 h-9 bg-[var(--bg-tertiary)] rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[var(--bg-tertiary)] rounded w-3/4" />
                    <div className="h-3 bg-[var(--bg-secondary)] rounded w-1/2" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-[var(--bg-secondary)] rounded-3xl p-8 border border-[#BC25F9]/25 text-center">
          <div className="w-16 h-16 bg-[#F87171]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[var(--text-primary)] font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
          <button onClick={loadTimeline} className="text-[#BC25F9] font-medium hover:underline">
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !hasData && (
        <div className="bg-[var(--bg-secondary)] rounded-3xl p-8 border border-[#BC25F9]/25 text-center">
          <div className="w-16 h-16 bg-[#BC25F9]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h3 className="font-semibold text-[var(--text-primary)] mb-1">No activity yet</h3>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {hasMeds === null
              ? "Loading your data..."
              : hasMeds
              ? "Your medications are set up — doses and logged symptoms will appear here as they happen."
              : "Add a medication with a frequency to generate dose reminders, then log symptoms to see your full timeline."
            }
          </p>
          {hasMeds && (
            <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-2 h-2 bg-[#34D399] rounded-full" />
                <span>Doses appear when you set a frequency on your medication</span>
              </div>
              <div className="flex items-center gap-2 justify-center">
                <div className="w-2 h-2 bg-[#BC25F9] rounded-full" />
                <span>Log symptoms from the Tracker tab to track your health patterns</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline with collapsible days */}
      {!loading && !error && hasData && (
        <div className="space-y-3 pb-20">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.date);
            const today = localDateStr(new Date().toISOString());
            const isTodayGroup = group.date === today;

            return (
              <div
                key={group.date}
                className="bg-[var(--bg-secondary)] rounded-3xl border border-[#BC25F9]/25 overflow-hidden transition-all duration-300"
              >
                {/* Date header — tappable */}
                <button
                  onClick={() => toggleGroup(group.date)}
                  className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[var(--bg-secondary)]/60 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {isTodayGroup && (
                      <span className="w-2 h-2 bg-[#BC25F9] rounded-full shadow-[0_0_8px_rgba(188,37,249,0.4)]" />
                    )}
                    <h2 className={`text-sm font-semibold ${
                      isTodayGroup ? "text-[#BC25F9]" : "text-[var(--text-secondary)]"
                    }`}>
                      {group.label}
                    </h2>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {group.entries.length} item{group.entries.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`w-4 h-4 text-[var(--text-secondary)] transition-transform duration-300 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Entries */}
                <div
                  className={`transition-all duration-300 ease-out overflow-hidden ${
                    isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="divide-y divide-[var(--bg-tertiary)] border-t border-[#BC25F9]/25">
                    {group.entries.map((entry) => {
                      if (entry.type === "dose") {
                        const status = entry.status || "pending";
                        return (
                          <div key={entry.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-[var(--bg-secondary)]/40 transition-colors duration-150">
                            <DoseIcon status={status} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[15px] font-medium text-[var(--text-primary)] truncate">
                                  {entry.medication_name || `Medication #${entry.medication_id}`}
                                </span>
                                {entry.dosage && (
                                  <span className="text-xs text-[var(--text-secondary)]">{entry.dosage}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-[var(--text-secondary)]">{formatTime12h(entry.scheduled_time || "")}</span>
                                <span className="text-[#3F3F46]">•</span>
                                <span
                                  className={`text-xs font-medium ${
                                    status === "taken"
                                      ? "text-[#BC25F9]"
                                      : status === "missed"
                                      ? "text-[#F87171]"
                                      : status === "skipped"
                                      ? "text-[var(--text-secondary)]"
                                      : "text-[var(--text-secondary)]"
                                  }`}
                                >
                                  {status === "taken"
                                    ? "Taken"
                                    : status === "missed"
                                    ? "Missed"
                                    : status === "skipped"
                                    ? "Skipped"
                                    : "Pending"}
                                </span>
                              </div>
                              {entry.notes && (
                                <p className="text-xs text-[var(--text-secondary)] mt-1 italic">{entry.notes}</p>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Symptom entry
                      const sev = entry.severity || 1;
                      const sevLabel = sev === 1 ? "Mild" : sev === 2 ? "Mild" : sev === 3 ? "Moderate" : sev === 4 ? "Strong" : "Severe";
                      return (
                        <div
                          key={entry.id}
                          className="px-5 py-3.5 flex items-center gap-3 hover:bg-[var(--bg-secondary)]/40 transition-colors duration-150"
                          style={{
                            background:
                              sev >= 4
                                ? "linear-gradient(90deg, rgba(248,113,113,0.04) 0%, transparent 100%)"
                                : "transparent",
                          }}
                        >
                          <SymptomIcon severity={sev} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-medium text-[var(--text-primary)]">
                                {entry.name}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)]">{sevLabel}</span>
                            </div>
                            <SeverityBar severity={sev} />
                            {entry.medication_name && (
                              <p className="text-xs text-[#BC25F9] mt-1">
                                Linked: {entry.medication_name}
                              </p>
                            )}
                            {entry.notes && (
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                                {entry.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
