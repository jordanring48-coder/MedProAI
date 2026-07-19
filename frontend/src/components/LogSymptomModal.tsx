import { useState, useEffect, useRef } from "react";
import type { Medication } from "../types";
import { createSymptom, fetchMedications, fetchCommonSymptoms } from "../api";

interface Props {
  onClose: () => void;
  onSaved: () => void;
  initialValues?: {
    name?: string;
    severity?: number;
    notes?: string;
  };
}

export default function LogSymptomModal({ onClose, onSaved, initialValues }: Props) {
  const [name, setName] = useState(initialValues?.name || "");
  const [severity, setSeverity] = useState(initialValues?.severity || 3);
  const [notes, setNotes] = useState(initialValues?.notes || "");
  const [loggedAt, setLoggedAt] = useState(() => {
    // Build local datetime string for the datetime-local input
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [medicationId, setMedicationId] = useState<number | null>(null);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [commonNames, setCommonNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savedAnimation, setSavedAnimation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMedications().then(setMeds).catch(() => {});
    fetchCommonSymptoms().then(setCommonNames).catch(() => {});
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = commonNames.filter((n) =>
    n.toLowerCase().includes(name.toLowerCase())
  ).slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Symptom name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const loggedAtISO = new Date(loggedAt).toISOString();
      await createSymptom({
        name: name.trim(),
        severity,
        notes: notes.trim() || undefined,
        logged_at: loggedAtISO,
        medication_id: medicationId || undefined,
      });
      setSavedAnimation(true);
      setTimeout(() => {
        onSaved();
      }, 700);
    } catch (err: any) {
      setError(err.message || "Failed to save symptom");
      setSaving(false);
    }
  };

  if (savedAnimation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-[#161618] rounded-2xl p-8 shadow-xl border border-[#27272A] text-center animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-[#34D399]/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34D399" className="w-8 h-8">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
          <p className="text-[17px] font-semibold text-[#FAFAFA]">Symptom Logged</p>
          <p className="text-sm text-[#A1A1AA] mt-1">Added to your timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[#161618] rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-4 duration-300 border border-[#27272A]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[#27272A]">
            <h2 className="text-[17px] font-semibold text-[#FAFAFA]">Log a Symptom</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-8 h-8 bg-[#1C1C1F] rounded-full flex items-center justify-center hover:bg-[#27272A] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#71717A" className="w-4 h-4">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5">
            {error && (
              <div className="bg-[#F87171]/10 text-[#F87171] text-sm px-4 py-2.5 rounded-xl font-medium">
                {error}
              </div>
            )}

            {/* Symptom name with suggestions */}
            <div className="relative">
              <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
                Symptom
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="e.g. Headache, Nausea..."
                className="w-full bg-[#1C1C1F] rounded-xl px-4 py-3 text-[15px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/40 focus:bg-[#1C1C1F] transition-colors"
                autoComplete="off"
              />
              {showSuggestions && filtered.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 bg-[#1C1C1F] border border-[#3F3F46] rounded-xl shadow-lg mt-1 z-10 overflow-hidden"
                >
                  {filtered.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setName(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-[15px] text-[#A1A1AA] hover:bg-[#27272A] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Severity selector */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-2">
                Severity
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => {
                  const isActive = level <= severity;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setSeverity(level)}
                      className="flex-1 flex flex-col items-center gap-1 transition-all active:scale-90"
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                          isActive
                            ? level <= 2
                              ? "bg-[#34D399] text-[#0A0A0B] shadow-sm"
                              : level <= 3
                              ? "bg-[#FBBF24] text-[#0A0A0B] shadow-sm"
                              : level <= 4
                              ? "bg-[#F97316] text-white shadow-sm"
                              : "bg-[#F87171] text-white shadow-sm"
                            : "bg-[#1C1C1F] text-[#71717A]"
                        }`}
                      >
                        {level}
                      </div>
                      <span className="text-[10px] font-medium text-[#71717A]">
                        {level === 1 ? "Mild" : level === 5 ? "Severe" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Medication link */}
            {meds.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
                  Related Medication{" "}
                  <span className="text-[#71717A] font-normal">(optional)</span>
                </label>
                <select
                  value={medicationId ?? ""}
                  onChange={(e) =>
                    setMedicationId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full bg-[#1C1C1F] rounded-xl px-4 py-3 text-[15px] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/40 transition-colors appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z' fill='%2371717A'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 16px center",
                    paddingRight: "40px",
                  }}
                >
                  <option value="">None</option>
                  {meds.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
                Notes <span className="text-[#71717A] font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
                className="w-full bg-[#1C1C1F] rounded-xl px-4 py-3 text-[15px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/40 transition-colors resize-none"
              />
            </div>

            {/* Date/time */}
            <div>
              <label className="block text-sm font-medium text-[#A1A1AA] mb-1.5">
                When
              </label>
              <input
                type="datetime-local"
                value={loggedAt}
                onChange={(e) => setLoggedAt(e.target.value)}
                className="w-full bg-[#1C1C1F] rounded-xl px-4 py-3 text-[15px] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#2DE2A0]/40 transition-colors color-scheme-dark"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 pt-0 pb-8">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#2DE2A0] text-white font-semibold text-[17px] py-3.5 rounded-2xl shadow-sm hover:bg-[#24B882] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Log Symptom"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
