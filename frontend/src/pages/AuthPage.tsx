import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext";

type Tab = "login" | "signup";

export default function AuthPage() {
  const { login, signup, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate("/", { replace: true });
    return null;
  }

  return <AuthPageInner login={login} signup={signup} navigate={navigate} />;
}

function AuthPageInner({
  login,
  signup,
  navigate,
}: {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  navigate: (path: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    if (tab === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (tab === "login") {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password, name.trim() || undefined);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <img
            src="/app-logo.png"
            alt="Luna"
            className="w-20 h-20 rounded-2xl mb-4"
            style={{ boxShadow: "0 4px 24px rgba(188, 37, 249, 0.35)" }}
          />
          <h1 className="text-2xl font-bold text-white mb-1">Luna</h1>
          <p className="text-gray-500 text-sm">Your medication, on your timeline</p>
        </div>

        {/* Card */}
        <div className="bg-[#151517] rounded-2xl border border-[#27272A] p-6">
          {/* Tabs */}
          <div className="flex mb-6 bg-[#27272A] rounded-xl p-1">
            <button
              onClick={() => { setTab("login"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "login"
                  ? "bg-[#BC25F9] text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setTab("signup"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "signup"
                  ? "bg-[#BC25F9] text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-xl">
              <p className="text-[#FF3B30] text-sm">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Name <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-[#27272A] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3F3F46] focus:border-[#BC25F9] focus:outline-none transition-colors"
                />
              </div>
            )}

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
                className="w-full bg-[#27272A] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3F3F46] focus:border-[#BC25F9] focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                className="w-full bg-[#27272A] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3F3F46] focus:border-[#BC25F9] focus:outline-none transition-colors"
              />
            </div>

            {tab === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full bg-[#27272A] text-white rounded-xl px-4 py-3 text-sm placeholder-gray-600 border border-[#3F3F46] focus:border-[#BC25F9] focus:outline-none transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#BC25F9] text-white font-semibold text-[15px] py-3 rounded-xl hover:bg-[#A020F0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_16px_rgba(188,37,249,0.35)]"
            >
              {submitting
                ? "Please wait..."
                : tab === "login"
                ? "Log In"
                : "Create Account"}
            </button>
          </form>

          {/* Forgot password link */}
          {tab === "login" && (
            <div className="mt-4 text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-[#BC25F9] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Luna v0.4.0
        </p>
      </div>
    </div>
  );
}
