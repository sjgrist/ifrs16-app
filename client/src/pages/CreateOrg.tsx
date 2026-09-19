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

export function CreateOrgPage() {
  const { setOrg, signOut, user } = useAuthStore();
  const { toast } = useToast();
  const [tab, setTab] = useState<"create" | "join">("create");
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center">
            <span className="text-white text-xl font-bold">16</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">Welcome, {user?.name?.split(" ")[0] ?? "there"}!</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Create a new organisation or join an existing one
            </p>
          </div>
        </div>

        <div className="card overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {(["create", "join"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? "text-brand-600 border-b-2 border-brand-500"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
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
                  <label className="label">Organisation name</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    autoFocus
                  />
                </div>

                {corpDomain && (
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={claimDomain}
                      onChange={(e) => setClaimDomain(e.target.checked)}
                      className="mt-0.5 accent-brand-500"
                    />
                    <span className="text-sm text-[var(--text)]">
                      Auto-enrol anyone with a{" "}
                      <strong>@{corpDomain}</strong> email address
                      <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                        They'll join as a member automatically when they sign in
                      </span>
                    </span>
                  </label>
                )}

                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? "Creating…" : "Create organisation"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="label">Invite code</label>
                  <input
                    className="input font-mono text-sm"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste the invite code here"
                    autoFocus
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Ask your admin for the organisation's invite code from Settings → Organisation.
                  </p>
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? "Joining…" : "Join organisation"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="text-center">
          <button onClick={signOut} className="text-xs text-[var(--text-muted)] hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
