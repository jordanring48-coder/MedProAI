import { useState } from "react";
import { formatTime12h } from "../utils";
import type { Dose } from "../types";
import { updateDose } from "../api";

interface DoseEditModalProps {
  dose: Dose;
  onClose: () => void;
  onSaved: () => void;
}

const STATUSES = ["pending", "taken", "missed", "skipped"] as const;
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  taken: "Taken",
  missed: "Missed",
  skipped: "Skipped",
};

export default function DoseEditModal({ dose, onClose, onSaved }: DoseEditModalProps) {
  const [status, setStatus] = useState(dose.status);
  const [takenAt, setTakenAt] = useState(dose.taken_at || dose.scheduled_time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await updateDose(dose.id, status, takenAt);
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save");
      setSaving(false);
    }
  };

  const medName = (dose.medication_name || `Medication #${dose.medication_id}`).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-secondary)] rounded-3xl p-6 w-[90vw] max-w-[360px] shadow-[0_0_30px_rgba(188,37,249,0.15)] border border-[#BC25F9]/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 className="text-base font-bold text-[var(--text-primary)] tracking-wide">
          {medName}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Scheduled: {formatTime12h(dose.scheduled_time)}
        </p>

        {/* Status picker */}
        <div className="mt-5">
          <p className="text-xs text-[var(--text-secondary)] mb-2 uppercase tracking-wider font-semibold">
            Status
          </p>
          <div className="grid grid-cols-4 gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`py-2.5 px-2 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] ${
                  status === s
                    ? "bg-[#BC25F9] text-white"
                    : "bg-[#27272A] text-[var(--text-secondary)] hover:bg-[#3F3F46]"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Time input — only visible when status is "taken" */}
        {status === "taken" && (
          <div className="mt-4">
            <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider font-semibold block mb-2">
              Actual time taken
            </label>
            <input
              type="time"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
              className="w-full bg-[#27272A] text-[var(--text-primary)] rounded-xl px-4 py-2.5 text-sm border border-[#3F3F46] focus:border-[#BC25F9] focus:outline-none"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-[#F87171] mt-3">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 px-3 bg-[#27272A] text-[var(--text-secondary)] text-sm font-semibold rounded-xl hover:bg-[#3F3F46] active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 px-3 bg-[#BC25F9] text-white text-sm font-semibold rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
