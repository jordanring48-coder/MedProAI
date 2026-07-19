import { Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import OnboardingModal from "./components/OnboardingModal";
import ProtectedRoute from "./components/ProtectedRoute";
import { useOnboarding } from "./hooks/useOnboarding";
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import MedsPage from "./pages/MedsPage";
import MedicationDetailPage from "./pages/MedicationDetailPage";
import TimelinePage from "./pages/TimelinePage";
import SchedulePage from "./pages/SchedulePage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";
import PaywallPage from "./pages/PaywallPage";

export default function App() {
  const { showOnboarding, acknowledge } = useOnboarding();

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      {showOnboarding && <OnboardingModal onDismiss={acknowledge} />}
      <Routes>
        {/* Public routes */}
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/paywall" element={<PaywallPage />} />

        {/* Protected routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}

function MainLayout() {
  return (
    <>
      <main className="pb-20 pb-safe">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tracker" element={<MedsPage />} />
          <Route path="/medications/:id" element={<MedicationDetailPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/monica" element={<AssistantPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Redirect /assistant → /monica */}
          <Route path="/assistant" element={<Navigate to="/monica" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}
