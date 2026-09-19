import { useState } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "live.com", "live.co.uk", "msn.com", "aol.com", "ymail.com",
]);

function getCorpDomain(email: string | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || PERSONAL_DOMAINS.has(domain)) return null;
  return domain;
}

type Tab = "create" | "join";

export function CreateOrgPage() {
  const { setOrg, signOut, user } = useAuthStore();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("create");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  const corpDomain = getCorpDomain(user?.email);
  const [claimDomain, setClaimDomain] = useState(true);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const domainToSend = corpDomain && claimDomain ? corpDomain : null;
      const { org } = await api.auth.createOrg(name.trim(), domainToSend);
      setOrg(org);
      toast("Organisation created");
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);
    try {
      const { org } = await api.auth.joinOrg(inviteCode.trim());
      setOrg(org);
      toast("Joined organisation");
    } catch (err: unknown) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const firstName = user?.name?.split(" ")[0] ?? "there";

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
              Welcome, {firstName}!
            </h1>
            <p className="text-sm text-white/60 mt-2">
              Set up your organisation to get started
            </p>
          </div>
        </div>

        {/* ── Form card ────────────────────────────────────────────────── */}
        <div className="bg-white/[0.07] backdrop-blur-md border border-white/15 rounded-2xl overflow-hidden shadow-2xl shadow-black/30">

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {(["create", "join"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "text-white border-b-2 border-white/60"
                    : "text-white/45 hover:text-white/70"
                }`}
              >
                {t === "create" ? "Create new" : "Join existing"}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === "create" ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
                    Organisation name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    required
                    autoFocus
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent transition-colors"
                  />
                </div>

                {corpDomain && (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={claimDomain}
                      onChange={(e) => setClaimDomain(e.target.checked)}
                      className="mt-0.5 accent-brand-500 flex-shrink-0"
                    />
                    <span className="text-sm text-white/80">
                      Auto-enrol anyone with a{" "}
                      <strong className="text-white">@{corpDomain}</strong> email address
                      <span className="block text-xs text-white/45 mt-0.5">
                        They'll join as a member automatically when they sign in
                      </span>
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="w-full rounded-lg bg-white text-[#0b1628] px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow mt-1"
                >
                  {loading ? "Creating…" : "Create organisation"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/55 mb-1.5 uppercase tracking-wide">
                    Invite code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste the invite code here"
                    required
                    autoFocus
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-white/25 focus:border-transparent font-mono transition-colors"
                  />
                  <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                    Ask your admin for the code from Settings → Organisation.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading || !inviteCode.trim()}
                  className="w-full rounded-lg bg-white text-[#0b1628] px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 active:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
                >
                  {loading ? "Joining…" : "Join organisation"}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center">
          <button
            onClick={signOut}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
