import { useState, useEffect } from "react";

const ONBOARDING_KEY = "luna_onboarding_acknowledged";

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const ack = localStorage.getItem(ONBOARDING_KEY);
    if (!ack && !checked) {
      setShowOnboarding(true);
    }
    setChecked(true);
  }, [checked]);

  const acknowledge = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  };

  return { showOnboarding, acknowledge };
}
