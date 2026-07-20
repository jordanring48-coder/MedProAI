import { useState, useEffect, useRef } from "react";
import type { Dose, Appointment } from "../types";
import { fetchDoseHistory, fetchUpcomingAppointments } from "../api";
import usePremium from "../hooks/usePremium";
import { useTheme } from "../ThemeContext";
import UserAvatar from "../components/UserAvatar";
import DoseEditModal from "../components/DoseEditModal";
import AppointmentModal from "../components/AppointmentModal";
import { formatTime12h } from "../utils";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(dateStr: string): boolean {
  return dateStr === localDateStr(new Date());
}

function isPast(dateStr: string): boolean {
  return dateStr < localDateStr(new Date());
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface TimeBucket {
  label: string;
  items: ScheduleItem[];
}

interface DoseItem {
  kind: "dose";
  dose: Dose;
}

interface AppointmentItem {
  kind: "appointment";
  appointment: Appointment;
}

type ScheduleItem = DoseItem | AppointmentItem;

export default function SchedulePage() {
  const { isPremium } = usePremium();
  const { theme } = useTheme();
  const today = localDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [dosesByDate, setDosesByDate] = useState<Record<string, Dose[]>>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const from = localDateStr(new Date(Date.now() - 7 * 86400000));
      const to = localDateStr(new Date(Date.now() + 14 * 86400000));
      const doses = await fetchDoseHistory(
        new Date(from + "T00:00:00Z").toISOString(),
        new Date(to + "T23:59:59Z").toISOString()
      );

      const grouped: Record<string, Dose[]> = {};
      for (const dose of doses) {
        const date = dose.scheduled_date || localDateStr(new Date(dose.created_at));
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(dose);
      }
      for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
      }

      setDosesByDate(grouped);
    } catch {}

    try {
      const appts = await fetchUpcomingAppointments();
      setAppointments(appts);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Generate 7-day date strip: 3 before today, today, 3 after
  const dateStrip = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 3 + i);
    return {
      dateStr: localDateStr(d),
      dayName: DAY_NAMES[d.getDay()],
      dayNum: d.getDate(),
    };
  });

  // Auto-scroll selected pill into view
  useEffect(() => {
    if (!stripRef.current) return;
    const pill = stripRef.current.querySelector(`[data-date="${selectedDate}"]`);
    if (pill) {
      pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDate]);

  // Build time-of-day buckets for the selected date
  const dosesForDate = dosesByDate[selectedDate] || [];
  const apptsForDate = appointments.filter((a) => a.date === selectedDate);

  const items: ScheduleItem[] = [
    ...dosesForDate.map((dose): DoseItem => ({ kind: "dose", dose })),
    ...apptsForDate.map((appt): AppointmentItem => ({ kind: "appointment", appointment: appt })),
  ].sort((a, b) => {
    const timeA = a.kind === "dose" ? a.dose.scheduled_time : a.appointment.time;
    const timeB = b.kind === "dose" ? b.dose.scheduled_time : b.appointment.time;
    return timeA.localeCompare(timeB);
  });

  const buckets: TimeBucket[] = [
    { label: "Morning", items: [] },
    { label: "Afternoon", items: [] },
    { label: "Evening", items: [] },
  ];

  for (const item of items) {
    const time = item.kind === "dose" ? item.dose.scheduled_time : item.appointment.time;
    if (time < "12:00") {
      buckets[0].items.push(item);
    } else if (time < "17:00") {
      buckets[1].items.push(item);
    } else {
      buckets[2].items.push(item);
    }
  }

  const visibleBuckets = buckets.filter((b) => b.items.length > 0);
  const dateIsPast = isPast(selectedDate);

  return (
    <div className="pb-28 min-h-screen">
      {/* App wordmark top bar */}
      <div className="flex items-center justify-center pt-0 pb-1 px-5 relative">
        <img src={theme === "dark" ? "/appheader.png" : "/101.png"} alt="MedTrack AI" className="h-9 object-contain" />
        <div className="absolute right-5 top-0">
          <UserAvatar />
        </div>
      </div>
      {/* Header */}
      <div className="relative pt-0 pb-4 px-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#BC25F9]/10 rounded-xl flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">Schedule</h1>
          <button
            onClick={() => { setEditingAppointment(null); setShowAppointmentModal(true); }}
            className="bg-[#BC25F9] text-white rounded-xl px-4 py-2 font-medium text-sm ml-auto"
          >
            + Add
          </button>
        </div>
        <p className="text-[15px] text-[var(--text-secondary)] mt-1.5 ml-[42px]">Your dose schedule & appointments</p>
      </div>

      <div className="px-5">
      {/* Horizontal Date Strip */}
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-5 -mx-5 px-5 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {dateStrip.map((d) => {
          const isSel = d.dateStr === selectedDate;
          const isTodayDate = isToday(d.dateStr);
          const isSelToday = isSel && isTodayDate;

          let pillClasses =
            "flex-shrink-0 w-14 h-18 flex flex-col items-center justify-center rounded-full snap-center transition-all active:scale-95 cursor-pointer";

          if (isSelToday) {
            // Today + selected: mint filled with glow
            pillClasses +=
              " bg-[#BC25F9] text-[#0A0A0B] font-bold shadow-[0_0_12px_rgba(188,37,249,0.3)]";
          } else if (isSel) {
            // Selected but not today: mint border
            pillClasses += " border-2 border-[#BC25F9] text-[var(--text-primary)]";
          } else if (isTodayDate) {
            // Today but not selected: subtle highlight
            pillClasses += " text-[#BC25F9] font-semibold";
          } else {
            // Other days
            pillClasses += " text-[var(--text-secondary)]";
          }

          return (
            <button
              key={d.dateStr}
              data-date={d.dateStr}
              onClick={() => setSelectedDate(d.dateStr)}
              className={pillClasses}
            >
              <span className="text-[11px] leading-tight">{d.dayName}</span>
              <span className="text-base leading-tight">{d.dayNum}</span>
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[var(--bg-secondary)] rounded-3xl p-5 border border-[#BC25F9]/25 animate-pulse shadow-[0_0_12px_rgba(188,37,249,0.18)]"
            >
              <div className="h-4 bg-[var(--bg-tertiary)] rounded w-24 mb-4" />
              <div className="space-y-2">
                <div className="h-3 bg-[var(--bg-tertiary)] rounded w-full" />
                <div className="h-3 bg-[var(--bg-tertiary)] rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content for selected date */}
      {!loading && (
        <div className="space-y-4">
          {visibleBuckets.length === 0 ? (
            <div className="bg-[var(--bg-secondary)] rounded-3xl p-8 border border-[#BC25F9]/25 text-center shadow-[0_0_12px_rgba(188,37,249,0.18)]">
              <div className="w-16 h-16 bg-[#BC25F9]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#BC25F9"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-8 h-8"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">Nothing scheduled</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                No doses or appointments for{" "}
                {isToday(selectedDate) ? "today" : "this day"}.
              </p>
            </div>
          ) : (
            visibleBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="bg-[var(--bg-secondary)] rounded-3xl border border-[#BC25F9]/25 overflow-hidden transition-opacity duration-300 shadow-[0_0_12px_rgba(188,37,249,0.18)]"
              >
                {/* Time-of-day header */}
                <div className="px-5 py-2.5 bg-[var(--bg-tertiary)]">
                  <span className="text-[var(--text-secondary)] text-xs font-semibold uppercase tracking-wider">
                    {bucket.label}
                  </span>
                </div>

                {/* Items */}
                <div className="divide-y divide-[var(--bg-tertiary)]">
                  {bucket.items.map((item, idx) => {
                    if (item.kind === "dose") {
                      return <DoseRow key={`dose-${item.dose.id}`} dose={item.dose} onDoseUpdate={loadData} />;
                    } else {
                      return (
                        <AppointmentRow
                          key={`appt-${item.appointment.id}`}
                          appointment={item.appointment}
                          isPast={dateIsPast}
                        />
                      );
                    }
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <AppointmentModal
          appointment={editingAppointment}
          onClose={() => { setShowAppointmentModal(false); setEditingAppointment(null); }}
          onSaved={() => { setShowAppointmentModal(false); setEditingAppointment(null); loadData(); }}
        />
      )}
    </div>
  );
}

/* ── Dose Row ── */

function DoseRow({ dose, onDoseUpdate }: { dose: Dose; onDoseUpdate: () => void }) {
  const [showEdit, setShowEdit] = useState(false);

  const status = dose.status;
  const isPastPending =
    status === "pending" && dose.scheduled_time < new Date().toTimeString().slice(0, 5);
  const effectiveStatus = isPastPending ? "missed" : status;

  const dotStyle: Record<string, string> = {
    taken: "bg-[#BC25F9]",
    missed: "bg-[#F87171]",
    skipped: "bg-[#52525B]",
    pending: "border-2 border-[var(--text-secondary)]",
  };

  const dotClass = dotStyle[effectiveStatus] || dotStyle.pending;

  return (
    <>
      <div
        className="px-5 py-3.5 flex items-center gap-3 cursor-pointer active:bg-[var(--bg-tertiary)]"
        onClick={() => setShowEdit(true)}
      >
        {/* Status dot */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${dotClass}`} />

        {/* Time */}
        <span className="text-sm font-medium text-[var(--text-primary)] w-14 flex-shrink-0 tabular-nums">
          {formatTime12h(dose.scheduled_time)}
        </span>

        {/* Pill icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={effectiveStatus === "taken" ? "#BC25F9" : effectiveStatus === "missed" ? "#F87171" : effectiveStatus === "skipped" ? "#52525B" : "var(--text-secondary)"}
          strokeWidth="2"
          className="w-4 h-4 flex-shrink-0"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path d="M7 12h10" />
        </svg>

        {/* Med name */}
        <span className="text-[15px] text-[var(--text-primary)] flex-1 truncate">
          {dose.medication_name || `Medication #${dose.medication_id}`}
        </span>
      </div>

      {showEdit && (
        <DoseEditModal
          dose={dose}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onDoseUpdate(); }}
        />
      )}
    </>
  );
}

/* ── Appointment Row ── */

function AppointmentRow({
  appointment,
  isPast,
}: {
  appointment: Appointment;
  isPast: boolean;
}) {
  const muted = isPast ? "opacity-50" : "";

  return (
    <div className={`px-5 py-3.5 flex items-center gap-3 ${muted}`}>
      {/* Status dot — cyan */}
      <div className="w-3 h-3 rounded-full flex-shrink-0 bg-[#BC25F9]" />

      {/* Time */}
      <span className="text-sm font-medium text-[var(--text-primary)] w-14 flex-shrink-0 tabular-nums">
        {formatTime12h(appointment.time)}
      </span>

      {/* Calendar icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#BC25F9"
        strokeWidth="2"
        className="w-4 h-4 flex-shrink-0"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>

      {/* Appointment details */}
      <div className="flex-1 min-w-0">
        <span className="text-[15px] text-[var(--text-primary)] truncate block">
          {appointment.title}
        </span>
        {appointment.doctor_name && (
          <span className="text-xs text-[var(--text-secondary)] truncate block">
            {appointment.doctor_name}
            {appointment.location ? ` · ${appointment.location}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
