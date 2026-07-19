import { useNavigate } from "react-router-dom";
import usePremium from "../hooks/usePremium";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  featureName?: string;
}

export default function PremiumGate({ children, fallback, featureName }: Props) {
  const { isPremium } = usePremium();
  const navigate = useNavigate();

  if (isPremium) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="relative">
      {/* Upgrade banner */}
      <div className="bg-gradient-to-r from-[#BC25F9]/10 to-[#A020F0]/10 border-b border-[#BC25F9]/20 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">✨</span>
            <p className="text-sm text-[#FAFAFA] truncate">
              {featureName
                ? `Upgrade to Premium to unlock ${featureName}`
                : "Upgrade to Premium to unlock this feature"}
            </p>
          </div>
          <button
            onClick={() => navigate("/paywall")}
            className="flex-shrink-0 bg-[#BC25F9] text-[#0A0A0B] font-semibold text-xs px-4 py-2 rounded-xl hover:bg-[#A020F0] active:scale-[0.97] transition-all"
          >
            View Plans
          </button>
        </div>
      </div>

      {/* Dimmed content */}
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
    </div>
  );
}
