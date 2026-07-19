import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Medication, Dose, AdherenceStats, Appointment } from "../types";
import { fetchMedications, fetchTodayDoses, fetchAdherenceStats, fetchUpcomingAppointments } from "../api";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";
import usePremium from "../hooks/usePremium";
import LogSymptomModal from "../components/LogSymptomModal";
import AddEditMedicationModal from "../components/AddEditMedicationModal";
import UserAvatar from "../components/UserAvatar";

function MintRing({ percentage, size = 100, strokeWidth = 8, celebrating = false }: { percentage: number; size?: number; strokeWidth?: number; celebrating?: boolean }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${celebrating ? "animate-[ringPulse_0.4s_ease-out]" : ""}`}>
      {/* Sparkle particles during celebration */}
      {celebrating && (
        <div className="absolute inset-0 pointer-events-none" style={{ width: size, height: size }}>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * 360;
            const distance = 30 + Math.random() * 25;
            return (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 bg-[#BC25F9] rounded-full"
                style={{
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${-distance}px)`,
                  animation: "sparkleBurst 1.5s ease-out forwards",
                  animationDelay: `${i * 0.05}s`,
                  opacity: 0,
                }}
              />
            );
          })}
        </div>
      )}
      <svg
        width={size}
        height={size}
        className={`-rotate-90 ${celebrating ? "drop-shadow-[0_0_30px_rgba(188,37,249,0.6)]" : "drop-shadow-[0_0_12px_rgba(188,37,249,0.4)]"} transition-all duration-500`}
      >
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="var(--bg-tertiary)" strokeWidth={strokeWidth} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#BC25F9" strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: celebrating ? "drop-shadow(0 0 10px rgba(188,37,249,0.6))" : "drop-shadow(0 0 12px rgba(188,37,249,0.4))" }}
        />
      </svg>
      <span className="absolute text-2xl font-bold text-[var(--text-primary)]">
        {percentage}%
      </span>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTimeIcon() {
  const hour = new Date().getHours();
  if (hour < 17) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-[#BC25F9] flex-shrink-0">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-[#BC25F9] flex-shrink-0">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function getSubtitle(streak: number, adherencePct: number, totalToday: number, takenToday: number, medsCount: number): string {
  if (streak >= 7) return `You're on a ${streak}-day streak! 🎉`;
  if (totalToday > 0 && adherencePct === 100) return "All caught up for today ✨";
  if (totalToday > 0) {
    const pending = totalToday - takenToday;
    return `You have ${pending} medication${pending !== 1 ? "s" : ""} to take today`;
  }
  if (medsCount === 0) return "Ready to start your health journey";
  return "No doses scheduled for today";
}

function localToday(): string {
  // Returns YYYY-MM-DD in the user's local timezone
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { isPremium } = usePremium();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [todayDoses, setTodayDoses] = useState<Dose[]>([]);
  const [stats, setStats] = useState<AdherenceStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSymptomModal, setShowSymptomModal] = useState(false);
  const [showAddMedModal, setShowAddMedModal] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const prevAdherencePct = useRef(0);
  const dateRef = useRef(localToday());

  const loadData = useCallback(async () => {
    const today = localToday();
    try {
      const [medsData, dosesData, statsData] = await Promise.all([
        fetchMedications(),
        fetchTodayDoses(today),
        fetchAdherenceStats(7),
      ]);
      setMeds(medsData);
      setTodayDoses(dosesData);
      setStats(statsData);
    } catch {}
    // Appointments in background
    fetchUpcomingAppointments().then(setAppointments).catch(() => {});
    setLoading(false);
    setCelebrating(false);
    dateRef.current = today;
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Midnight refresh: reload when the date changes
  useEffect(() => {
    const scheduleMidnightRefresh = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - now.getTime();

      return setTimeout(() => {
        loadData();
        // After midnight, reschedule for the next midnight
        const nextTimeout = scheduleMidnightRefresh();
        return () => clearTimeout(nextTimeout);
      }, msUntilMidnight);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (localToday() !== dateRef.current) {
          loadData();
        }
      }
    };

    const timeout = scheduleMidnightRefresh();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadData]);

  const takenToday = todayDoses.filter((d) => d.status === "taken").length;
  const totalToday = todayDoses.length;
  const adherencePct = totalToday > 0 ? Math.round((takenToday / totalToday) * 100) : 0;

  // Celebration detection: trigger when adherence transitions from <100 to 100
  useEffect(() => {
    if (prevAdherencePct.current < 100 && adherencePct === 100) {
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), 2000);
      prevAdherencePct.current = adherencePct;
      return () => clearTimeout(timer);
    }
    prevAdherencePct.current = adherencePct;
  }, [adherencePct]);

  // Next dose
  const nextDose = todayDoses
    .filter((d) => d.status === "pending")
    .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))[0];

  // Next appointment
  const nextAppt = appointments[0];

  // Adherence streak (from stats)
  const adherence7d = stats?.adherence ?? -1;
  const streakCount = stats?.streak ?? 0;

  const streakMessage = streakCount >= 7
    ? "Unstoppable! 🔥"
    : streakCount >= 4
    ? "You're on a roll!"
    : "Keep it going!";

  const name = user?.name?.split(" ")[0] || "there";

  const subtitle = getSubtitle(streakCount, adherencePct, totalToday, takenToday, meds.length);

  return (
    <div className="pb-24 min-h-screen">
      {/* Greeting */}
      <div className="relative bg-[var(--bg-primary)] pt-14 pb-6 px-5">
        <div className="absolute right-5 top-3">
          <UserAvatar />
        </div>
        <div className="flex justify-center mb-4">
          <img src={theme === "light" ? "/luna-header-light.png" : "/luna-header.png"} alt="Luna" className="h-28 object-contain" />
        </div>
        <div className="flex items-center gap-2 mb-1">
          {getTimeIcon()}
          <span className="text-[17px] font-medium text-[var(--text-secondary)]">{getGreeting()},</span>
        </div>
        <h2 className="text-4xl font-bold text-[var(--text-primary)] tracking-tight">{name}</h2>
        <p className="text-sm text-[#71717A] mt-1">{subtitle}</p>
      </div>

      <div className="px-5">
      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-secondary)] rounded-3xl p-6 border border-[#BC25F9]/25 animate-pulse shadow-[0_0_12px_rgba(188,37,249,0.18)]">
            <div className="h-4 bg-[#27272A] rounded w-24 mb-4" />
            <div className="flex items-center gap-6">
              <div className="w-[100px] h-[100px] bg-[#27272A] rounded-full" />
              <div className="flex-1 space-y-3">
                <div className="h-4 bg-[#27272A] rounded w-3/4" />
                <div className="h-3 bg-[#151517] rounded w-1/2" />
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Today's Meds Status Card */}
          <button
            onClick={() => navigate("/tracker")}
            className="w-full text-left bg-[var(--bg-secondary)] rounded-3xl p-6 border border-[#BC25F9]/25 mb-4 hover:border-[#BC25F9]/50 active:scale-[0.98] transition-all duration-300 shadow-[0_0_12px_rgba(188,37,249,0.18)]"
          >
            <div className="flex items-center gap-5">
              <MintRing percentage={adherencePct} size={90} strokeWidth={7} celebrating={celebrating} />
              <div className="flex-1">
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)] mb-1">
                  Today's Medications
                </h3>
                <p className="text-[15px] text-[var(--text-secondary)]">
                  {totalToday > 0
                    ? `${takenToday} of ${totalToday} taken`
                    : "No doses scheduled today"}
                </p>
                {totalToday > 0 && takenToday === totalToday && (
                  <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-[#BC25F9]/10 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC25F9" className="w-3.5 h-3.5">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span className="text-xs font-semibold text-[#BC25F9]">All done!</span>
                  </span>
                )}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#3F3F46] flex-shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>

          {/* Streak Card — only visible when streak >= 2 */}
          {streakCount >= 2 && (
            <button
              onClick={() => navigate("/timeline")}
              className="w-full text-left bg-[var(--bg-secondary)] rounded-3xl p-4 border border-[#FBBF24]/20 mb-4 hover:border-[#FBBF24]/40 active:scale-[0.98] transition-all duration-300 shadow-[0_0_12px_rgba(188,37,249,0.18)]"
              style={{ boxShadow: "0 0 20px rgba(251, 191, 36, 0.08)" }}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#FBBF24]/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🔥</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                    {streakCount}-Day Streak!
                  </h3>
                  <p className="text-[15px] text-[var(--text-secondary)] mt-0.5">
                    {streakMessage}
                  </p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#3F3F46] flex-shrink-0">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          )}

          {/* Adherence (7d) Card */}
          <button
            onClick={() => navigate("/timeline")}
            className="w-full text-left bg-[var(--bg-secondary)] rounded-3xl p-6 border border-[#BC25F9]/25 mb-4 hover:border-[#BC25F9]/50 active:scale-[0.98] transition-all duration-300 shadow-[0_0_12px_rgba(188,37,249,0.18)]"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#BC25F9]/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">Adherence (7d)</h3>
                <p className="text-[15px] text-[var(--text-secondary)] mt-0.5">
                  {adherence7d === -1
                    ? "No data yet"
                    : adherence7d >= 80
                    ? "Great job staying on track!"
                    : adherence7d >= 50
                    ? "Keep going, you're doing well"
                    : "Let's get back on track"}
                </p>
              </div>
              <span className={
                adherence7d === -1
                  ? "text-2xl font-bold text-[#52525B]"
                  : "text-2xl font-bold text-[#BC25F9]"
              }>
                {adherence7d === -1 ? "—" : `${adherence7d}%`}
              </span>
            </div>
          </button>

          {/* Upcoming Card */}
          <div className="bg-[var(--bg-secondary)] rounded-3xl border border-[#BC25F9]/25 overflow-hidden mb-4 shadow-[0_0_12px_rgba(188,37,249,0.18)]">
            {/* Next dose */}
            <button
              onClick={() => navigate("/tracker")}
              className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-[#151517]/60 transition-colors duration-200"
            >
              <div className="w-10 h-10 bg-[#BC25F9]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-[var(--text-primary)]">Next Dose</p>
                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {nextDose
                    ? `${nextDose.medication_name || "Medication"} at ${nextDose.scheduled_time}`
                    : "No upcoming doses"}
                </p>
              </div>
            </button>

            {/* Divider */}
            <div className="border-t border-[#BC25F9]/25" />

            {/* Next appointment (premium) */}
            <button
              onClick={() => navigate("/schedule")}
              className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-[#151517]/60 transition-colors duration-200"
            >
              <div className="w-10 h-10 bg-[#BC25F9]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-[var(--text-primary)]">Next Appointment</p>
                <p className="text-sm text-[var(--text-secondary)] truncate">
                  {isPremium
                    ? nextAppt
                      ? `${nextAppt.title} — ${new Date(nextAppt.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "No upcoming appointments"
                    : "Premium feature — tap to upgrade"}
                </p>
              </div>
              {!isPremium && (
                <span className="text-xs font-semibold text-[#FBBF24] bg-[#FBBF24]/10 px-2 py-1 rounded-lg">PRO</span>
              )}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => setShowSymptomModal(true)}
              className="bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[#BC25F9]/25 hover:border-[#BC25F9]/50 active:scale-[0.97] transition-all duration-200 shadow-[0_0_12px_rgba(188,37,249,0.18)] flex flex-col items-center gap-2"
            >
              <div className="w-10 h-10 bg-[#BC25F9]/10 rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="text-xs font-medium text-[var(--text-secondary)]">Log Symptom</span>
            </button>

            <button
              onClick={() => setShowAddMedModal(true)}
              className="bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[#BC25F9]/25 hover:border-[#BC25F9]/50 active:scale-[0.97] transition-all duration-200 shadow-[0_0_12px_rgba(188,37,249,0.18)] flex flex-col items-center gap-2"
            >
              <div className="w-10 h-10 bg-[#BC25F9]/10 rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#BC25F9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <span className="text-xs font-medium text-[var(--text-secondary)]">Add Med</span>
            </button>

            <button
              onClick={() => navigate("/timeline")}
              className="bg-[var(--bg-secondary)] rounded-2xl p-4 border border-[#BC25F9]/25 hover:border-[#BC25F9]/50 active:scale-[0.97] transition-all duration-200 shadow-[0_0_12px_rgba(188,37,249,0.18)] flex flex-col items-center gap-2"
            >
              <div className="w-10 h-10 bg-[#FBBF24]/10 rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <span className="text-xs font-medium text-[var(--text-secondary)]">Timeline</span>
            </button>
          </div>

          {/* Medication summary */}
          {meds.length > 0 && (
            <div className="bg-[var(--bg-secondary)] rounded-3xl border border-[#BC25F9]/25 p-5 mb-4 shadow-[0_0_12px_rgba(188,37,249,0.18)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">Your Medications</h3>
                <button
                  onClick={() => navigate("/tracker")}
                  className="text-sm font-medium text-[#BC25F9] hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-2">
                {meds.slice(0, 3).map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center gap-3 py-2"
                  >
                    <div className="w-2 h-2 bg-[#BC25F9] rounded-full flex-shrink-0" />
                    <span className="text-[15px] text-[var(--text-primary)] truncate flex-1">{med.name}</span>
                    {med.dosage && (
                      <span className="text-sm text-[#71717A]">{med.dosage}</span>
                    )}
                  </div>
                ))}
                {meds.length > 3 && (
                  <p className="text-sm text-[#71717A] text-center pt-2">
                    +{meds.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {/* Modals */}
      {showSymptomModal && (
        <LogSymptomModal
          onClose={() => setShowSymptomModal(false)}
          onSaved={() => setShowSymptomModal(false)}
        />
      )}
      {showAddMedModal && (
        <AddEditMedicationModal
          medication={null}
          onClose={() => setShowAddMedModal(false)}
          onSaved={() => {
            setShowAddMedModal(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
