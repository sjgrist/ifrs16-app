import { useState } from "react";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";

export function LoginPage() {
  const { signInWithGoogle, signInWithMicrosoft, signInDemo } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handle = async (label: string, fn: () => Promise<void>) => {
    setLoading(label);
    try { await fn(); }
    catch (e: unknown) { toast((e as Error).message, "error"); setLoading(null); }
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

        {/* Sign-in buttons */}
        <div className="card p-6 space-y-3">
          <button
            onClick={() => handle("google", signInWithGoogle)}
            disabled={loading !== null}
            className="btn-secondary w-full justify-center gap-3"
          >
            <GoogleIcon />
            {loading === "google" ? "Redirecting…" : "Continue with Google"}
          </button>

          <button
            onClick={() => handle("microsoft", signInWithMicrosoft)}
            disabled={loading !== null}
            className="btn-secondary w-full justify-center gap-3"
          >
            <MicrosoftIcon />
            {loading === "microsoft" ? "Redirecting…" : "Continue with Microsoft"}
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-[var(--border)]" />
            <span className="text-xs text-[var(--text-muted)]">or</span>
            <div className="flex-1 border-t border-[var(--border)]" />
          </div>

          <button
            onClick={() => handle("demo", signInDemo)}
            disabled={loading !== null}
            className="btn-secondary w-full justify-center text-[var(--text-muted)]"
          >
            {loading === "demo" ? "Signing in…" : "Try demo account"}
          </button>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)]">
          By signing in you agree to use this tool for legitimate lease accounting purposes.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022"/>
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00"/>
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF"/>
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900"/>
    </svg>
  );
}
