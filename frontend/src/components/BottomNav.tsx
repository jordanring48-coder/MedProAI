import { NavLink, useLocation } from "react-router-dom";

const tabs = [
  {
    to: "/",
    label: "Home",
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: "/tracker",
    label: "Tracker",
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="3" width="18" height="12" rx="4" />
        <line x1="12" y1="9" x2="12" y2="15" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    ),
  },
  {
    to: "/schedule",
    label: "Schedule",
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <rect x="8" y="13" width="3" height="3" rx="0.5" />
      </svg>
    ),
  },
  {
    to: "/monica",
    label: "Monica AI",
    icon: (active: boolean) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        {/* Star 1 — top-left */}
        <path d="M6 5L7.5 8.5L11 10L7.5 11.5L6 15L4.5 11.5L1 10L4.5 8.5Z" />
        {/* Star 2 — bottom-right */}
        <path d="M17 13L18 15.5L20.5 16.5L18 17.5L17 20L16 17.5L13.5 16.5L16 15.5Z" />
        {/* Star 3 — center-right */}
        <path d="M18 6L19 8L21 9L19 10L18 12L17 10L15 9L17 8Z" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-nav z-50 pb-safe">
      <div className="flex justify-around items-center h-[66px] max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const isActive =
            tab.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`relative flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-xl transition-all duration-200 active:scale-[0.92] ${
                isActive
                  ? "text-[#BC25F9] ring-2 ring-[#BC25F9]/30"
                  : "text-[#71717A] hover:text-[#A1A1AA]"
              }`}
            >
              {tab.icon(isActive)}
              <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute -bottom-0.5 w-1.5 h-1.5 bg-[#BC25F9] rounded-full shadow-[0_0_10px_rgba(188,37,249,0.6)]" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
