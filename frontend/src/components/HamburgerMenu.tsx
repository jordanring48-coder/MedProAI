import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import usePremium from "../hooks/usePremium";

export default function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const { isPremium } = usePremium();
  const navigate = useNavigate();

  const open = () => {
    setIsOpen(true);
    setIsClosing(false);
  };

  const close = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 250);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleLogout = () => {
    close();
    setTimeout(() => {
      logout();
      navigate("/auth");
    }, 300);
  };

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={open}
        className="fixed top-0 left-0 z-40 w-12 h-12 flex items-center justify-center safe-top"
        aria-label="Menu"
      >
        <div className="flex flex-col gap-1">
          <span className="block w-5 h-[2px] bg-[#A1A1AA] rounded-full transition-all duration-200" />
          <span className="block w-5 h-[2px] bg-[#A1A1AA] rounded-full transition-all duration-200" />
          <span className="block w-3.5 h-[2px] bg-[#A1A1AA] rounded-full transition-all duration-200" />
        </div>
      </button>

      {/* Overlay + Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/60 ${isClosing ? "overlay-exit" : "overlay-enter"}`}
            onClick={close}
          />

          {/* Drawer */}
          <div
            ref={drawerRef}
            className={`absolute top-0 left-0 bottom-0 w-[300px] max-w-[85vw] bg-[#0A0A0B] border-r border-[#27272A] flex flex-col ${isClosing ? "drawer-exit" : "drawer-enter"}`}
          >
            {/* Drawer header */}
            <div className="p-6 pt-14 safe-top border-b border-[#27272A]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-[#BC25F9] to-[#A020F0] rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold text-[#0A0A0B]">
                    {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-[#FAFAFA] truncate">
                    {user?.name || "User"}
                  </p>
                  <p className="text-sm text-[#A1A1AA] truncate">
                    {user?.email || ""}
                  </p>
                </div>
              </div>

              {/* Premium badge */}
              {isPremium ? (
                <span className="inline-flex items-center gap-1.5 bg-[#FBBF24]/10 border border-[#FBBF24]/30 px-3 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FBBF24" className="w-3.5 h-3.5">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  <span className="text-xs font-semibold text-[#FBBF24]">Premium</span>
                </span>
              ) : (
                <button
                  onClick={() => {
                    close();
                    setTimeout(() => navigate("/profile"), 300);
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#BC25F9]/10 border border-[#BC25F9]/30 px-3 py-1 rounded-full hover:bg-[#BC25F9]/20 transition-colors"
                >
                  <span className="text-xs font-semibold text-[#BC25F9]">Upgrade to Premium</span>
                </button>
              )}
            </div>

            {/* Menu items */}
            <div className="flex-1 py-4 px-3">
              <nav className="space-y-1">
                {!isPremium && (
                  <button
                    onClick={() => {
                      close();
                      setTimeout(() => navigate("/profile"), 300);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] text-[#FAFAFA] hover:bg-[#111113] transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                    Upgrade to Premium
                  </button>
                )}

                <button
                  onClick={() => {
                    close();
                    setTimeout(() => navigate("/profile"), 300);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] text-[#FAFAFA] hover:bg-[#111113] transition-colors duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#A1A1AA]">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Profile & Settings
                </button>

                <button
                  onClick={() => {
                    close();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] text-[#FAFAFA] hover:bg-[#111113] transition-colors duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#A1A1AA]">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  Dark Mode
                  <span className="ml-auto text-xs text-[#71717A]">Always On</span>
                </button>
              </nav>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#27272A] safe-bottom">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] text-[#F87171] hover:bg-[#F87171]/5 transition-colors duration-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log Out
              </button>
              <p className="text-center text-[10px] text-[#3F3F46] mt-3">Luna v0.4.0</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
