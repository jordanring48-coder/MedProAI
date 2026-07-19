interface OnboardingModalProps {
  onDismiss: () => void;
}

export default function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0B] overflow-y-auto">
      <div className="min-h-full px-6 pt-safe pb-safe flex flex-col items-center">
        {/* --- Logo & Header --- */}
        <div className="flex flex-col items-center pt-12 pb-8">
          <img
            src="/app-logo.png"
            className="w-16 h-16 rounded-2xl mb-4"
            style={{
              boxShadow: "0 4px 24px rgba(45, 226, 160, 0.35)",
            }}
            alt="MedTrack AI"
          />
          <h1 className="text-2xl font-bold text-white">MedTrack AI</h1>
          <p className="text-[#A1A1AA] mt-2 text-sm">Your personal medication companion</p>
        </div>

        {/* --- Feature Synopsis (2×2 grid) --- */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-6">
          <FeatureCard
            icon={PillIcon}
            title="Medication Tracking"
            description="Stay on schedule with smart reminders"
          />
          <FeatureCard
            icon={SparkleIcon}
            title="Monica AI"
            description="AI-powered health assistant"
          />
          <FeatureCard
            icon={CalendarIcon}
            title="Appointments"
            description="Never miss a doctor visit"
          />
          <FeatureCard
            icon={ClipboardIcon}
            title="Symptom Logging"
            description="Spot patterns, share with your doctor"
          />
        </div>

        {/* --- Disclaimer --- */}
        <div className="bg-[#FBBF24]/5 border border-[#FBBF24]/20 rounded-2xl p-5 w-full max-w-md mb-8">
          <h3 className="text-[#FBBF24] font-semibold text-sm mb-3">Important Disclaimer</h3>
          <p className="text-[#FBBF24]/70 text-sm leading-relaxed">
            MedTrack AI is a medication management tool and does not replace professional medical
            advice. Monica AI is an assistant, not a diagnostic tool. Always consult your doctor or
            pharmacist before making changes to your medication regimen. If you are experiencing a
            medical emergency, call 911 immediately.
          </p>
        </div>

        {/* --- Spacer to push button to bottom --- */}
        <div className="flex-1" />

        {/* --- "I understand" button (sticky at bottom) --- */}
        <div className="sticky bottom-0 w-full max-w-md pb-24 bg-[#0A0A0B] pt-4">
          <button
            onClick={onDismiss}
            className="w-full bg-[#2DE2A0] text-[#0A0A0B] font-semibold text-[17px] py-4 rounded-2xl active:scale-[0.98] transition-transform"
            style={{
              boxShadow: "0 4px 20px rgba(45, 226, 160, 0.3)",
            }}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───── Feature card ───── */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[#161618] rounded-2xl p-4 border border-[#27272A] flex flex-col gap-2">
      <Icon className="text-[#2DE2A0] w-6 h-6" />
      <span className="text-white font-semibold text-sm leading-tight">{title}</span>
      <span className="text-[#A1A1AA] text-xs leading-relaxed">{description}</span>
    </div>
  );
}

/* ───── SVG icons ───── */
function PillIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 20.5a5 5 0 0 0 7.07-7.07L10.5 20.5Z" />
      <path d="M13.5 3.5a5 5 0 0 0-7.07 7.07L13.5 3.5Z" />
      <path d="M10.5 13.5l-7 7" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l.75 2.25L8 22l-2.25.75L5 25l-.75-2.25L2 22l2.25-.75L5 19z" />
      <path d="M19 13l.5 1.5L21 15l-1.5.5L19 17l-.5-1.5L17 15l1.5-.5L19 13z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}
