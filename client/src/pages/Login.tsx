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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="text-white text-lg font-bold tracking-tight">Rℴ</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">RoU-lio</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">IFRS 16 lease accounting</p>
          </div>
        </div>

        {signedUp ? (
          <div className="card p-6 text-center space-y-3">
            <div className="text-3xl">📬</div>
            <p className="font-medium">Check your email</p>
            <p className="text-sm text-[var(--text-muted)]">
              We've sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account.
            </p>
            <button
              onClick={() => { setSignedUp(false); setMode("signin"); }}
              className="btn-ghost text-sm"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
              {(["signin", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    mode === m
                      ? "text-brand-600 border-b-2 border-brand-500"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="label">Your name</label>
                  <input
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    required
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="label">Work email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@yourcompany.com"
                  required
                  autoFocus={mode === "signin"}
                />
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : ""}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading
                  ? mode === "signup" ? "Creating account…" : "Signing in…"
                  : mode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="px-6 pb-6 space-y-3">
              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-[var(--border)]" />
                <span className="text-xs text-[var(--text-muted)]">or</span>
                <div className="flex-1 border-t border-[var(--border)]" />
              </div>

              <button
                onClick={handleDemo}
                disabled={loading}
                className="btn-secondary w-full justify-center text-[var(--text-muted)]"
              >
                {loading ? "Signing in…" : "Try demo account"}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-[var(--text-muted)]">
          By signing in you agree to use this tool for legitimate lease accounting purposes.
        </p>
      </div>
    </div>
  );
}
