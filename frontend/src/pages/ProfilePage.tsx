import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AdherenceStats, Allergy, Appointment, Medication, Provider, SavedReport } from "../types";
import { getRefillStatus, getRefillLabel } from "../types";
import {
  fetchAdherenceStats,
  fetchUpcomingAppointments,
  fetchRefillList,
  deleteAppointment,
  updateProfile,
  fetchAllergies,
  createAllergy,
  deleteAllergy,
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  fetchReports,
} from "../api";
import { useAuth } from "../AuthContext";
import { useTheme } from "../ThemeContext";
import usePremium from "../hooks/usePremium";
import AppointmentModal from "../components/AppointmentModal";
import UserAvatar, { AVATAR_GRADIENTS } from "../components/UserAvatar";

const AVATAR_COLORS = ["purple", "pink", "violet", "coral", "teal", "amber"];

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
          stroke="var(--bg-tertiary)"
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
  const { theme, toggleTheme } = useTheme();
  const { isPremium, upgradedAt } = usePremium();
  const [stats7, setStats7] = useState<AdherenceStats | null>(null);
  const [stats30, setStats30] = useState<AdherenceStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [refills, setRefills] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [newAllergyName, setNewAllergyName] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", phone: "", email: "", address: "", specialty: "" });
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);

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

  useEffect(() => {
    const loadAllergies = async () => {
      try {
        const data = await fetchAllergies();
        setAllergies(data.allergies);
      } catch {}
    };
    loadAllergies();
  }, []);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const data = await fetchProviders();
        setProviders(data.providers);
      } catch {}
    };
    loadProviders();
  }, []);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const data = await fetchReports();
        setReports(data.reports);
      } catch {}
    };
    loadReports();
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

  const handleAddAllergy = async () => {
    const name = newAllergyName.trim();
    if (!name) return;
    try {
      const allergy = await createAllergy(name);
      setAllergies((prev) => [...prev, { id: allergy.id, name: allergy.name }]);
      setNewAllergyName("");
    } catch {}
  };

  const handleDeleteAllergy = async (id: number) => {
    try {
      await deleteAllergy(id);
      setAllergies((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  };

  const handleCreateProvider = async () => {
    const name = newProvider.name.trim();
    if (!name) return;
    try {
      const provider = await createProvider(newProvider);
      setProviders((prev) => [...prev, provider]);
      setNewProvider({ name: "", phone: "", email: "", address: "", specialty: "" });
      setShowProviderForm(false);
    } catch {}
  };

  const handleDeleteProvider = async (id: number) => {
    try {
      await deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } catch {}
  };

  // Urgent refills (red status)
  const urgentRefills = refills.filter((m) => getRefillStatus(m.refill_date) === "red");
  const upcomingRefills = refills.filter((m) => getRefillStatus(m.refill_date) === "orange");

  return (
    <div className="pb-24 min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="relative bg-gradient-to-b from-[#BC25F9]/20 to-transparent pt-14 pb-4 px-5">
        <div className="absolute right-5 top-3">
          <UserAvatar />
        </div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-1">Profile</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Your health stats & settings</p>
      </div>

      <div className="px-5">
      {/* Avatar Color */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 p-5 mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Avatar Color</p>
        <div className="flex gap-3">
          {AVATAR_COLORS.map((colorName) => {
            const selectedColor = user?.avatarColor || "purple";
            const isSelected = selectedColor === colorName;
            const grad = AVATAR_GRADIENTS[colorName] || AVATAR_GRADIENTS.purple;
            return (
              <button
                key={colorName}
                onClick={() => handleAvatarColor(colorName)}
                className={`w-10 h-10 rounded-full transition-all duration-200 active:scale-95 ${
                  isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-[#111113]" : ""
                }`}
                style={{
                  background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                  ...(isSelected ? { boxShadow: `0 0 10px 2px ${grad.glow}` } : {}),
                }}
                aria-label={`Avatar color ${colorName}`}
              />
            );
          })}
        </div>
      </div>

      {/* User info + Logout */}
      {user && (
        <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[#BC25F9]/25 p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">
              {user.name || user.email}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">{user.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate("/auth"); }}
            className="text-[#F87171] font-medium text-sm hover:underline"
          >
            Log Out
          </button>
        </div>
      )}

      {/* Theme Toggle */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 p-5 mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Theme</p>
        <div className="flex gap-3">
          <button
            onClick={toggleTheme}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all active:scale-95 ${
              theme === "light"
                ? "bg-[#BC25F9] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            }`}
          >
            ☀️ Light
          </button>
          <button
            onClick={toggleTheme}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all active:scale-95 ${
              theme === "dark"
                ? "bg-[#BC25F9] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            }`}
          >
            🌙 Dark
          </button>
        </div>
      </div>

      {/* Allergies */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F87171" className="w-5 h-5">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Allergies</h2>
        </div>
        {allergies.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-2">No allergies recorded</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {allergies.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 bg-[#BC25F9]/10 text-[#BC25F9] rounded-full px-3 py-1 text-sm">
                {a.name}
                <button onClick={() => handleDeleteAllergy(a.id)} className="p-1 hover:text-[#F87171] transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newAllergyName}
            onChange={(e) => setNewAllergyName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddAllergy(); }}
            placeholder="e.g. Penicillin"
            className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
          />
          <button
            onClick={handleAddAllergy}
            disabled={!newAllergyName.trim()}
            className="bg-[#BC25F9] text-white font-medium text-sm px-4 py-2.5 rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>

      {/* Providers */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0EA5E9" className="w-5 h-5">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">My Providers</h2>
          </div>
          <button
            onClick={() => setShowProviderForm(!showProviderForm)}
            className="text-[#BC25F9] font-medium text-sm hover:underline"
          >
            {showProviderForm ? "Cancel" : "+ Add"}
          </button>
        </div>

        {providers.length === 0 && !showProviderForm ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-2">No providers added yet</p>
        ) : (
          <div className="space-y-3 mb-4">
            {providers.map((p) => (
              <div key={p.id} className="bg-[var(--bg-primary)] rounded-xl p-4 relative">
                <button
                  onClick={() => handleDeleteProvider(p.id)}
                  className="absolute top-2 right-2 p-1.5 text-[var(--text-secondary)] hover:text-[#F87171] transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                  </svg>
                </button>
                <p className="text-[15px] font-semibold text-[var(--text-primary)] pr-6">{p.name}</p>
                {p.specialty && <p className="text-sm text-[#BC25F9] mt-0.5">{p.specialty}</p>}
                {p.phone && <p className="text-sm text-[var(--text-secondary)] mt-1">{p.phone}</p>}
                {p.email && <p className="text-sm text-[var(--text-secondary)]">{p.email}</p>}
                {p.address && <p className="text-sm text-[var(--text-secondary)]">{p.address}</p>}
              </div>
            ))}
          </div>
        )}

        {showProviderForm && (
          <div className="bg-[var(--bg-primary)] rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={newProvider.name}
              onChange={(e) => setNewProvider((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Provider name *"
              className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
            />
            <input
              type="text"
              value={newProvider.specialty}
              onChange={(e) => setNewProvider((prev) => ({ ...prev, specialty: e.target.value }))}
              placeholder="Specialty"
              className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
            />
            <div className="flex gap-2">
              <input
                type="tel"
                value={newProvider.phone}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone"
                className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
              />
              <input
                type="email"
                value={newProvider.email}
                onChange={(e) => setNewProvider((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
              />
            </div>
            <input
              type="text"
              value={newProvider.address}
              onChange={(e) => setNewProvider((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Address"
              className="w-full px-4 py-2.5 bg-[var(--bg-secondary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[#71717A] outline-none focus:ring-2 focus:ring-[#BC25F9]"
            />
            <button
              onClick={handleCreateProvider}
              disabled={!newProvider.name.trim()}
              className="w-full bg-[#BC25F9] text-white font-medium text-sm py-2.5 rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save Provider
            </button>
          </div>
        )}
      </div>

      {/* Reports */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F59E0B" className="w-5 h-5">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
          </svg>
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Reports</h2>
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] text-center py-2">No reports yet. Generate one with Monica AI.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReport(r)}
                className="w-full text-left bg-[var(--bg-primary)] rounded-xl p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <p className="text-[15px] font-medium text-[var(--text-primary)]">{r.title}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {new Date(r.created_at + "Z").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-secondary)] rounded-2xl p-6 shadow-sm animate-pulse">
            <div className="h-4 bg-[var(--bg-tertiary)] rounded w-32 mb-4" />
            <div className="flex gap-6 justify-center">
              <div className="w-20 h-20 bg-[var(--bg-tertiary)] rounded-full" />
              <div className="w-20 h-20 bg-[var(--bg-tertiary)] rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-[var(--bg-secondary)] rounded-2xl p-8 shadow-sm text-center">
          <p className="text-[#F87171] font-medium mb-4">{error}</p>
          <button onClick={loadAll} className="text-[#BC25F9] font-medium hover:underline">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && stats7 && stats30 && (
        <>
          {/* ── Premium Status Card ── */}
          <div className={`rounded-2xl border p-6 mb-4 ${isPremium ? "bg-gradient-to-br from-[#FBBF24]/10 to-[#FBBF24]/5 border-[#FBBF24]/30" : "bg-[var(--bg-secondary)] border-[#BC25F9]/25"}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-[var(--text-primary)]">
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
                <p className="text-sm text-[var(--text-secondary)] mt-0.5">
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
            <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[#BC25F9]/25 p-6 mb-4">
              <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC25F9" className="w-5 h-5">
                  <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                </svg>
                <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Refill Summary</h2>
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
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{m.name}</p>
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
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                          <p className={`text-xs ${colors.text}`}>{getRefillLabel(m.refill_date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {urgentRefills.length === 0 && upcomingRefills.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)] text-center py-2">All refills are up to date</p>
              )}
            </div>
          )}

          {/* ── Appointments Section (premium) ── */}
          {isPremium && (
            <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[#BC25F9]/25 p-6 mb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-5 h-5">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z" />
                  </svg>
                  <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Appointments</h2>
                </div>
                <button
                  onClick={() => { setEditingAppointment(null); setShowAppointmentModal(true); }}
                  className="text-[#BC25F9] font-medium text-sm hover:underline"
                >
                  + Add
                </button>
              </div>

              {appointments.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)] text-center py-4">
                  No upcoming appointments. Tap "+ Add" to schedule one.
                </p>
              ) : (
                <div className="space-y-3">
                  {appointments.map((a) => (
                    <div key={a.id} className="bg-[var(--bg-primary)] rounded-xl p-4 flex items-start gap-3">
                      <div className="w-10 h-10 bg-[#34D399]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-5 h-5">
                          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[var(--text-primary)]">{a.title}</p>
                        {a.doctor_name && (
                          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{a.doctor_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-secondary)]">
                          <span>{new Date(a.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          {a.time && <span>{a.time}</span>}
                          {a.location && <span>{a.location}</span>}
                        </div>
                        {a.notes && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 italic">{a.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingAppointment(a); setShowAppointmentModal(true); }}
                          className="text-[var(--text-secondary)] hover:text-[#BC25F9] p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteAppointment(a.id)}
                          className="text-[var(--text-secondary)] hover:text-[#F87171] p-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
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
          <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[#BC25F9]/25 p-6 mb-4">
            <h2 className="text-[17px] font-semibold text-[var(--text-primary)] mb-5 text-center">
              Adherence Rate
            </h2>
            <div className="flex justify-center gap-10">
              <div className="flex flex-col items-center gap-2">
                <RingChart percentage={stats7.adherence} />
                <span className="text-sm text-[var(--text-secondary)] font-medium">7 days</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {stats7.taken}/{stats7.taken + stats7.missed} doses
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <RingChart percentage={stats30.adherence} size={90} strokeWidth={9} />
                <span className="text-sm text-[var(--text-secondary)] font-medium">30 days</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {stats30.taken}/{stats30.taken + stats30.missed} doses
                </span>
              </div>
            </div>
          </div>

          {/* Stats summary */}
          <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-sm border border-[#BC25F9]/25 overflow-hidden mb-4">
            <div className="divide-y divide-[var(--bg-tertiary)]">
              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#BC25F9]/10 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#BC25F9" className="w-4 h-4">
                      <path d="M6 2h12v2H6V2zm0 4h12v2H6V6zm0 4h8v2H6v-2zm-2 4h16v8H4v-8z" />
                    </svg>
                  </div>
                  <span className="text-[var(--text-primary)]">Total Medications</span>
                </div>
                <span className="text-[17px] font-semibold text-[var(--text-primary)]">{stats30.totalMedications}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#34D399]/10 rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-4 h-4">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                  <span className="text-[var(--text-primary)]">Taken (30d)</span>
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
                  <span className="text-[var(--text-primary)]">Missed (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[#F87171]">{stats30.missed}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#71717A" className="w-4 h-4">
                      <path d="M6 6h12v12H6V6zm2 2v8h2v-4l2 4h2V8h-2v4l-2-4H8z" />
                    </svg>
                  </div>
                  <span className="text-[var(--text-primary)]">Skipped (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[var(--text-secondary)]">{stats30.skipped}</span>
              </div>

              <div className="px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center">
                    <div className="w-2 h-2 bg-[#71717A] rounded-full" />
                  </div>
                  <span className="text-[var(--text-primary)]">Pending (30d)</span>
                </div>
                <span className="text-[17px] font-semibold text-[var(--text-secondary)]">{stats30.pending}</span>
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

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-[var(--bg-secondary)] rounded-2xl border border-[#BC25F9]/25 max-w-lg w-full max-h-[80vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--bg-tertiary)] flex-shrink-0">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{selectedReport.title}</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {new Date(selectedReport.created_at + "Z").toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {selectedReport.content}
              </div>
            </div>
            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--bg-tertiary)] flex-shrink-0">
              <button
                onClick={() => setSelectedReport(null)}
                className="w-full bg-[#BC25F9] text-white font-medium text-sm py-2.5 rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-[var(--text-secondary)] mt-8">Luna v0.3.0</p>
    </div>
  );
}
