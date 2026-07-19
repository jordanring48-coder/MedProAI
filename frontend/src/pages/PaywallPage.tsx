import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PaywallPage() {
  const navigate = useNavigate();
  const [alreadyPremium] = useState(
    () => localStorage.getItem("luna_mock_premium") === "true"
  );

  const handleSubscribe = () => {
    localStorage.setItem("luna_mock_premium", "true");
    window.location.href = "/";
  };

  const handleRestore = () => {
    const restored = localStorage.getItem("luna_mock_premium") === "true";
    if (restored) {
      window.location.href = "/";
    } else {
      handleSubscribe();
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] px-5 py-12 safe-top safe-bottom">
      {/* Header */}
      <div className="flex flex-col items-center pt-4 pb-8">
        <img
          src="/app-logo.png"
          alt="Luna"
          className="w-20 h-20 rounded-2xl mb-4"
          style={{
            boxShadow: "0 4px 24px rgba(188, 37, 249, 0.35)",
          }}
        />
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Luna</h1>
        <p className="text-[#A1A1AA] mt-1.5 text-sm">Choose your plan</p>
      </div>

      {/* Plan cards */}
      <div className="max-w-lg mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Free tier */}
        <div className="bg-[#111113] rounded-2xl border border-[#27272A] p-6 flex flex-col">
          <h2 className="text-lg font-bold text-[#FAFAFA] mb-1">Free</h2>
          <div className="mb-5">
            <span className="text-3xl font-bold text-[#FAFAFA]">$0</span>
            <span className="text-sm text-[#71717A] ml-1">forever</span>
          </div>
          <ul className="space-y-2.5 mb-8 flex-1">
            <li className="flex items-start gap-2 text-sm text-[#A1A1AA]">
              <CheckIcon className="w-5 h-5 text-[#71717A] flex-shrink-0 mt-px" />
              Up to 5 medications
            </li>
            <li className="flex items-start gap-2 text-sm text-[#A1A1AA]">
              <CheckIcon className="w-5 h-5 text-[#71717A] flex-shrink-0 mt-px" />
              Basic reminders
            </li>
            <li className="flex items-start gap-2 text-sm text-[#A1A1AA]">
              <CheckIcon className="w-5 h-5 text-[#71717A] flex-shrink-0 mt-px" />
              Symptom logging
            </li>
            <li className="flex items-start gap-2 text-sm text-[#A1A1AA]">
              <CheckIcon className="w-5 h-5 text-[#71717A] flex-shrink-0 mt-px" />
              Medication history
            </li>
            <li className="flex items-start gap-2 text-sm text-[#A1A1AA]">
              <CheckIcon className="w-5 h-5 text-[#71717A] flex-shrink-0 mt-px" />
              Timeline view
            </li>
          </ul>
          <button
            onClick={() => navigate("/")}
            className="w-full border-2 border-[#3F3F46] text-[#FAFAFA] rounded-2xl py-3.5 font-semibold hover:border-[#71717A] active:scale-[0.98] transition-all text-sm"
          >
            Continue with Free
          </button>
        </div>

        {/* Premium tier */}
        <div className="bg-[#111113] rounded-2xl border-2 border-[#BC25F9]/40 p-6 relative overflow-hidden flex flex-col">
          {/* Premium badge */}
          <div className="absolute top-3 right-3 bg-[#BC25F9] text-[#0A0A0B] text-xs font-bold px-3 py-1 rounded-full">
            Premium
          </div>

          <h2 className="text-lg font-bold text-[#FAFAFA] mb-1">Premium</h2>
          <div className="mb-5">
            <span className="text-3xl font-bold text-[#FAFAFA]">$9.99</span>
            <span className="text-sm text-[#71717A] ml-1">/mo</span>
          </div>
          <ul className="space-y-2.5 mb-8 flex-1">
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Everything in Free
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Unlimited medications
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Monica AI assistant
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              AI reports &amp; insights
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Appointment tracking
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Data export
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Refill management
            </li>
            <li className="flex items-start gap-2 text-sm text-[#FAFAFA]">
              <CheckIcon className="w-5 h-5 text-[#BC25F9] flex-shrink-0 mt-px" />
              Priority support
            </li>
          </ul>

          {alreadyPremium ? (
            <div className="w-full bg-[#BC25F9]/10 border border-[#BC25F9]/30 text-[#BC25F9] rounded-2xl py-3.5 font-semibold text-center text-sm">
              You're already Premium!
            </div>
          ) : (
            <button
              onClick={handleSubscribe}
              className="w-full bg-[#BC25F9] text-[#0A0A0B] rounded-2xl py-3.5 font-semibold btn-glow shadow-[0_0_16px_rgba(188,37,249,0.35)] hover:bg-[#A020F0] active:scale-[0.98] transition-all text-sm"
            >
              Subscribe
            </button>
          )}
        </div>
      </div>

      {/* Restore link */}
      <div className="text-center mt-6">
        <button
          onClick={handleRestore}
          className="text-sm text-[#71717A] hover:text-[#A1A1AA] underline underline-offset-4 transition-colors"
        >
          Already subscribed? Restore purchase
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
