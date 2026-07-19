import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AdherenceStats, Appointment, Medication } from "../types";
import { getRefillStatus, getRefillLabel } from "../types";
import {
  fetchAdherenceStats,
  fetchUpcomingAppointments,
  fetchRefillList,
  deleteAppointment,
  updateProfile,
} from "../api";
import { useAuth } from "../AuthContext";
import usePremium from "../hooks/usePremium";
import AppointmentModal from "../components/AppointmentModal";
import UserAvatar from "../components/UserAvatar";

const AVATAR_COLORS = ["#BC25F9", "#14B8A6", "#0EA5E9", "#8B5CF6", "#F43F5E", "#F59E0B"];

const refillColors = {
  green: { dot: "bg-[#34D399]", bg: "bg-[#34D399]/10", text: "text-[#34D399]" },
  orange: { dot: "bg-[#FBBF24]", bg: "bg-[#FBBF24]/10", text: "text-[#FBBF24]" },
  red: { dot: "bg-[#F87171]", bg: "bg-[#F87171]/10", text: "text-[#F87171]" },
};

function RingChart({ percentage, size = 80, strokeWidth = 8 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const color = percentage >= 80 ? "#34D399" : percentage >= 50 ? "#FBBF24" : "#F87171";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#27272A"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className="absolute text-lg font-bold"
        style={{ color }}
      >
        {percentage}%
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, refreshUser, token } = useAuth();
  const { isPremium, upgradedAt } = usePremium();
  const [stats7, setStats7] = useState<AdherenceStats | null>(null);
  const [stats30, setStats30] = useState<AdherenceStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [refills, setRefills] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const loadAll = async () => {
    try {
      const [s7, s30, apps, refs] = await Promise.all([
        fetchAdherenceStats(7),
        fetchAdherenceStats(30),
        fetchUpcomingAppointments(),
        fetchRefillList(),
      ]);
      setStats7(s7);
      setStats30(s30);
      setAppointments(apps);
      setRefills(refs);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDeleteAppointment = async (id: number) => {
    try {
      await deleteAppointment(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // silently fail
    }
  };

  const handleAppointmentSaved = () => {
    setShowAppointmentModal(false);
    setEditingAppointment(null);
    loadAll();
  };

  const handleAvatarColor = async (color: string) => {
    if (!token) return;
    try {
      await updateProfile(token, { avatarColor: color });
      await refreshUser();
    } catch {
      // silently fail
    }
  };

  // Urgent refills (red status)
  const urgentRefills = refills.filter((m) => getRefillStatus(m.refill_date) === "red");
  const upcomingRefills = refills.filter((m) => getRefillStatus(m.refill_date) === "orange");

  return (
    <div className="pb-24 min-h-screen bg-[#0A0A0B]">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-[#BC25F9]/20 to-transparent pt-14 pb-4 px-5">
        <div className="absolute right-5 top-3">
          <UserAvatar />
        </div>
        <h1 className="text-3xl font-bold text-[#FAFAFA] mb-1">Profile</h1>
        <p className="text-[15px] text-[#A1A1AA]">Your health stats & settings</p>
      </div>

      <div className="px-5">
      {/* Avatar Color */}
      <div className="bg-[#111113] rounded-2xl border border-[#27272A] p-5 mb-4">
        <p className="text-sm font-semibold text-[#FAFAFA] mb-3">Avatar Color</p>
        <div className="flex gap-3">
          {AVATAR_COLORS.map((color) => {
            const isSelected = (user?.avatarColor || "#BC25F9") === color;
            return (
              <button
                key={color}
                onClick={() => handleAvatarColor(color)}
                className={`w-8 h-8 rounded-full transition-all duration-200 active:scale-95 ${
                  isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-[#111113]" : ""
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Avatar color ${color}`}
              />
            );
          })}
        </div>
      </div>

      {/* User info + Logout */}
      {user && (
        <div className="bg-[#111113] rounded-2xl shadow-sm border border-[#27272A] p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-[#FAFAFA]">
              {user.name || user.email}
            </p>
            <p className="text-sm text-[#A1A1AA]">{user.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate("/auth"); }}
            className="text-[#F87171] font-medium text-sm hover:underline"
          >
            Log Out
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="bg-[#111113] rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-4 bg-[#27272A] rounded w-32 mb-4" />
            <div className="flex gap-6 justify-center">
              <div className="w-20 h-20 bg-[#27272A] rounded-full" />
              <div className="w-20 h-20 bg-[#27272A] rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-[#111113] rounded-2xl p-8 shadow-sm text-center">
          <p className="text-[#F87171] font-medium mb-4">{error}</p>
          <button onClick={loadAll} className="text-[#BC25F9] font-medium hover:underline">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && stats7 && stats30 && (
        <>
          {/* ── Premium Status Card ── */}
          <div className={`rounded-2xl border p-6 mb-4 ${isPremium ? "bg-gradient-to-br from-[#FBBF24]/10 to-[#FBBF24]/5 border-[#FBBF24]/30" : "bg-[#111113] border-[#27272A]"}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-[#FAFAFA]">
                    {isPremium ? "Luna Premium" : "Luna Free"}
                  </h3>
                  {isPremium && (
                    <span className="inline-flex items-center gap-1 bg-[#FBBF24] px-2 py-0.5 rounded-full text-[11px] font-bold text-black">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                      </svg>
                      PREMIUM
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#A1A1AA] mt-0.5">
                  {isPremium
                    ? `Active since ${new Date(upgradedAt).toLocaleDateString()}`
                    : "Upgrade for AI-powered insights, unlimited medications, and more"}
                </p>
              </div>
              {isPremium ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FBBF24" className="w-8 h-8">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
              ) : (
                <button
                  onClick={() => navigate("/paywall")}
                  className="bg-[#FBBF24] text-black font-semibold text-sm py-2 px-4 rounded-xl hover:bg-[#F59E0B] active:scale-[0.97] transition-all"
                >
                  Upgrade to Premium
                </button>
              )}
            </div>
          </div>

          {/* ── Refill Summary (premium) ── */}
          {isPremium && refills.length > 0 && (
            <div className="bg-[#111113] rounded-2xl shadow-sm border border-[#27272A] p-6 mb-4">
              <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC25F9" className="w-5 h-5">
                  <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                </svg>
                <h2 className="text-[17px] font-semibold text-[#FAFAFA]">Refill Summary</h2>
              </div>

              {urgentRefills.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-[#F87171] uppercase tracking-wide mb-2">
                    Needs Attention
                  </p>
                  {urgentRefills.map((m) => {
                    const colors = refillColors.red;
                    return (
                      <div key={m.id} className={`${colors.bg} rounded-xl p-3 mb-2 flex items-center gap-3`}>
                        <div className={`w-2.5 h-2.5 ${colors.dot} rounded-full flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#FAFAFA] truncate">{m.name}</p>
                          <p className={`text-xs ${colors.text}`}>{getRefillLabel(m.refill_date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {upcomingRefills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#FBBF24] uppercase tracking-wide mb-2">
                    Upcoming
                  </p>
                  {upcomingRefills.map((m) => {
                    const colors = refillColors.orange;
                    return (
                      <div key={m.id} className={`${colors.bg} rounded-xl p-3 mb-2 flex items-center gap-3`}>
                        <div className={`w-2.5 h-2.5 ${colors.dot} rounded-full flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#FAFAFA] truncate">{m.name}</p>
                          <p className={`text-xs ${colors.text}`}>{getRefillLabel(m.refill_date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {urgentRefills.length === 0 && upcomingRefills.length === 0 && (
                <p className="text-sm text-[#71717A] text-center py-2">All refills are up to date</p>
              )}
            </div>
          )}

          {/* ── Appointments Section (premium) ── */}
          {isPremium && (
            <div className="bg-[#111113] rounded-2xl shadow-sm border border-[#27272A] p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-5 h-5">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z" />
                  </svg>
                  <h2 className="text-[17px] font-semibold text-[#FAFAFA]">Appointments</h2>
                </div>
                <button
                  onClick={() => { setEditingAppointment(null); setShowAppointmentModal(true); }}
                  className="text-[#BC25F9] font-medium text-sm hover:underline"
                >
                  + Add
                </button>
              </div>

              {appointments.length === 0 ? (
                <p className="text-sm text-[#71717A] text-center py-4">
                  No upcoming appointments. Tap "+ Add" to schedule one.
                </p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="bg-[#0A0A0B] rounded-xl p-4 flex items-start gap-3">
                      <div className="w-10 h-10 bg-[#34D399]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-5 h-5">
                          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[#FAFAFA]">{a.title}</p>
                        {a.doctor_name && (
                          <p className="text-sm text-[#A1A1AA] mt-0.5">{a.doctor_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[#71717A]">
                          <span>{new Date(a.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          {a.time && <span>{a.time}</span>}
                          {a.location && <span>{a.location}</span>}
                        </div>
                        {a.notes && (
                          <p className="text-xs text-[#71717A] mt-1.5 italic">{a.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingAppointment(a); setShowAppointmentModal(true); }}
                          className="text-[#71717A] hover:text-[#BC25F9] p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteAppointment(a.id)}
                          className="text-[#71717A] hover:text-[#F87171] p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Adherence rings */}
          <div className="bg-[#111113] rounded-2xl shadow-sm border border-[#27272A] p-6 mb-4">
            <h2 className="text-[17px] font-semibold text-[#FAFAFA] mb-5 text-center">
              Adherence Rate
            </h2>
            <div className="flex justify-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <RingChart percentage={stats7.adherence} />
                <span className="text-sm text-[#A1A1AA] font-medium">7 days</span>
                <span className="text-xs text-[#71717A]">
                  {stats7.taken}/{stats7.taken + stats7.missed} doses
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <RingChart percentage={stats30.adherence} size={90} strokeWidth={9} />
                <span className="text-sm text-[#A1A1AA] font-medium">30 days</span>
                <span className="text-xs text-[#71717A]">
                  {stats30.taken}/{stats30.taken + stats30.missed} doses
                </span>
              </div>
            </div>
          </div>

          {/* Stats summary */}
          <div className="bg-[#111113] rounded-2xl shadow-sm border border-[#27272A] overflow-hidden mb-4">
            <div className="divide-y divide-[#27272A]">
              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#BC25F9]/10 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC25F9" className="w-4 h-4">
                      <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                    </svg>
                  </div>
                  <span className="text-[#FAFAFA]">Total Medications</span>
                </div>
                <span className="text-[17px] font-semibold text-[#FAFAFA]">{stats30.totalMedications}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#34D399]/10 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-4 h-4">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                  <span className="text-[#FAFAFA]">Taken (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[#34D399]">{stats30.taken}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#F87171]/10 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F87171" className="w-4 h-4">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                    </svg>
                  </div>
                  <span className="text-[#FAFAFA]">Missed (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[#F87171]">{stats30.missed}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#27272A] rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#71717A" className="w-4 h-4">
                      <path d="M6 6h12v12H6V6zm2 2v8h2v-4l2 4h2V8h-2v4l-2-4H8z" />
                    </svg>
                  </div>
                  <span className="text-[#FAFAFA]">Skipped (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[#71717A]">{stats30.skipped}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#27272A] rounded-lg flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#71717A] rounded-full" />
                  </div>
                  <span className="text-[#FAFAFA]">Pending (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[#A1A1AA]">{stats30.pending}</span>
              </div>
            </div>
          </div>

        </>
      )}

      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <AppointmentModal
          appointment={editingAppointment}
          onClose={() => { setShowAppointmentModal(false); setEditingAppointment(null); }}
          onSaved={handleAppointmentSaved}
        />
      )}

      <p className="text-center text-xs text-[#71717A] mt-8">Luna v0.3.0</p>
    </div>
  );
}
