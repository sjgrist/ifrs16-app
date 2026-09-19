import { useState } from "react";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";

type Mode = "signin" | "signup";

export function LoginPage() {
  const { signInWithEmail, signUp, signInDemo } = useAuthStore();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedUp, setSignedUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, name);
        setSignedUp(true);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try { await signInDemo(); }
    catch (err: unknown) { toast((err as Error).message, "error"); setLoading(false); }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">

      {/* ── Background ───────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#070e1a] via-[#1a0e2e] to-brand-500" />

      {/* Grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -top-32 -right-20 w-96 h-96 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-orange-400/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/4 left-1/4 w-48 h-48 rounded-full bg-white/[0.03] border border-white/5" />

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-sm px-4 space-y-6">

        {/* Logo + headline */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30 shadow-lg">
            <svg width="28" height="31" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2"  width="36" height="8" rx="1.5" fill="#e55c2e"/>
              <rect x="2" y="13" width="27" height="8" rx="1.5" fill="#e55c2e"/>
              <rect x="2" y="24" width="18" height="8" rx="1.5" fill="#e55c2e"/>
              <rect x="2" y="35" width="9"  height="8" rx="1.5" fill="#e55c2e"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
              Lease Accounting,<br />Done Right.
            </h1>
            <p className="text-sm text-white/60 mt-2">
              End-to-end IFRS 16 compliance
            </p>
          </div>
        </div>

        {/* ── Form card ────────────────────────────────────────────────── */}
        {signedUp ? (
          <div className="bg-white/[0.08] backdrop-blur-md border border-white/15 rounded-2xl p-8 text-center space-y-4">
            <div className="text-4xl">📬</div>
            <p className="font-semibold text-white">Check your email</p>
            <p className="text-sm text-white/60 leading-relaxed">
              We've sent a confirmation link to{" "}
              <span className="text-white font-medium">{email}</span>.
              Click it to activate your account.
            </p>
            <button
              onClick={() => { setSignedUp(false); setMode("signin"); }}
              className="text-sm text-white/50 hover:text-white/80 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="bg-white/[0.07] backdrop-blur-md border border-white/15 rounded-2xl overflow-hidden shadow-2xl shadow-black/30">

            {/* Tabs */}
            <div className="flex border-b border-white/10">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? "text-white border-b-2 border-white/60"
                      : "text-white/45 hover:text-white/70"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
                    Your name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                    autoFocus
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
                  Work email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@yourcompany.com"
                  required
                  autoFocus={mode === "signin"}
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-white text-[#0b1628] px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow mt-1"
              >
                {loading
                  ? mode === "signup" ? "Creating account…" : "Signing in…"
                  : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="px-6 pb-6 space-y-3">
              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-white/10" />
                <span className="text-xs text-white/35">or</span>
                <div className="flex-1 border-t border-white/10" />
              </div>

              <button
                onClick={handleDemo}
                disabled={loading}
                className="w-full rounded-lg bg-white/10 border border-white/15 text-white/60 px-4 py-2.5 text-sm font-medium hover:bg-white/15 hover:text-white/80 disabled:opacity-50 transition-colors"
              >
                {loading ? "Signing in…" : "Try demo account"}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-white/30">
          By signing in you agree to use this tool for legitimate lease accounting purposes.
        </p>
      </div>
    </div>
  );
}
