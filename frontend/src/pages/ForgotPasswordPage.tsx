import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

type Step = "email" | "reset" | "done";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetTokenInfo, setResetTokenInfo] = useState<{ token: string; expires: string } | null>(null);
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      // Store the returned token info
      if (data.token) {
        setResetTokenInfo({ token: data.token, expires: data.expires });
        setStep("reset");
      } else {
        // The API still returns a message even if no account exists
        // Show the reset step anyway for privacy
        setStep("reset");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Reset token is required");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reset failed");
      }

      setStep("done");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#007AFF]/15 rounded-2xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#007AFF" className="w-8 h-8">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Reset Password</h1>
          <p className="text-gray-500 text-sm">
            {step === "email" && "Enter your email to receive a reset token"}
            {step === "reset" && "Enter the reset token and your new password"}
            {step === "done" && "Password reset successfully!"}
          </p>
        </div>

        <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] p-6">
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-xl">
              <p className="text-[#FF3B30] text-sm">{error}</p>
            </div>
          )}

          {step === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full bg-[#2C2C2E] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3A3A3C] focus:border-[#007AFF] focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#007AFF] text-white font-semibold text-[15px] py-3 rounded-xl hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : "Send Reset Token"}
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              {/* Show the token for dev (since there's no email integration) */}
              {resetTokenInfo && (
                <div className="p-3 bg-[#007AFF]/10 border border-[#007AFF]/20 rounded-xl mb-2">
                  <p className="text-[#007AFF] text-xs font-medium mb-1">
                    Development Mode — Reset Token:
                  </p>
                  <p className="text-white text-xs font-mono break-all select-all">
                    {resetTokenInfo.token}
                  </p>
                  <p className="text-gray-500 text-[10px] mt-1">
                    Expires: {new Date(resetTokenInfo.expires).toLocaleString()}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Reset Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste the reset token here"
                  className="w-full bg-[#2C2C2E] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3A3A3C] focus:border-[#007AFF] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full bg-[#2C2C2E] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3A3A3C] focus:border-[#007AFF] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full bg-[#2C2C2E] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3A3A3C] focus:border-[#007AFF] focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#007AFF] text-white font-semibold text-[15px] py-3 rounded-xl hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-[#34C759]/15 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#34C759" className="w-6 h-6">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              </div>
              <p className="text-white font-medium mb-2">Password Reset Complete</p>
              <p className="text-gray-500 text-sm mb-6">
                You can now log in with your new password.
              </p>
              <button
                onClick={() => navigate("/auth")}
                className="w-full bg-[#007AFF] text-white font-semibold text-[15px] py-3 rounded-xl hover:bg-[#0066D6] active:scale-[0.98] transition-all"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <Link to="/auth" className="text-sm text-[#007AFF] hover:underline">
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
