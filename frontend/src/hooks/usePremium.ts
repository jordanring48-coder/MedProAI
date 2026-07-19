import { useCallback } from "react";
import { useAuth } from "../AuthContext";
import type { PremiumState } from "../types";

const ADMIN_SECRET = "luna-admin";

function getMockPremium(): boolean {
  try {
    return localStorage.getItem("luna_mock_premium") === "true";
  } catch {
    return false;
  }
}

export default function usePremium() {
  const { isPremium: realIsPremium, premiumSince, user } = useAuth();

  const mockPremium = getMockPremium();
  const isPremium = mockPremium || realIsPremium;

  const upgrade = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`/api/admin/grant-premium?secret=${encodeURIComponent(ADMIN_SECRET)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      if (res.ok) {
        // Reload the page so AuthContext re-fetches /api/auth/me and picks up the new premium status
        window.location.reload();
      } else {
        const data = await res.json();
        console.error("Grant premium failed:", data.error);
      }
    } catch (err) {
      console.error("Grant premium error:", err);
    }
  }, [user?.email]);

  const reset = useCallback(() => {
    // For testing: remove premium. Not available via admin API currently
    // so we just reload to pick up server state.
    window.location.reload();
  }, []);

  return {
    isPremium,
    upgrade,
    reset,
    upgradedAt: premiumSince || "",
  };
}
