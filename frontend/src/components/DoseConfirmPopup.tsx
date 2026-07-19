import { useEffect, useRef } from "react";
import type { Dose } from "../types";

interface DoseConfirmPopupProps {
  dose: Dose;
  onConfirm: () => void;
  onSkip: () => void;
  onCancel: () => void;
  position?: { top: number; left: number };
}

export default function DoseConfirmPopup({
  dose,
  onConfirm,
  onSkip,
  onCancel,
  position,
}: DoseConfirmPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    // Delay adding listener so the current click doesn't close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onCancel]);

  const medName = (dose.medication_name || `Medication #${dose.medication_id}`).toUpperCase();

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-[var(--bg-secondary)] border border-[#BC25F9]/30 rounded-2xl p-4 shadow-[0_0_20px_rgba(188,37,249,0.2),0_8px_32px_rgba(0,0,0,0.4)] min-w-[240px] max-w-[280px] animate-[checkPop_0.2s_ease-out]"
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {/* Med name */}
      <p className="text-sm font-bold text-[var(--text-primary)] mb-1 tracking-wide">
        {medName}
      </p>
      {/* Scheduled time */}
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Scheduled: {dose.scheduled_time}
      </p>

      {/* Buttons row */}
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
          className="flex-1 py-2 px-3 bg-[#BC25F9] text-white text-sm font-semibold rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all duration-150"
        >
          Yes
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          className="flex-1 py-2 px-3 bg-[#FBBF24]/15 text-[#FBBF24] text-sm font-semibold rounded-xl border border-[#FBBF24]/30 hover:bg-[#FBBF24]/25 active:scale-[0.97] transition-all duration-150"
        >
          Skipped
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="flex-1 py-2 px-3 bg-[#27272A] text-[var(--text-secondary)] text-sm font-medium rounded-xl hover:bg-[#3F3F46] active:scale-[0.97] transition-all duration-150"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
