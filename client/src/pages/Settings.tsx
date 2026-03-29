import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Save, Copy, Shield, UserMinus } from "lucide-react";
import { api, type Entity, type AccountCode, type OrgMember } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";

export function SettingsPage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const { org, user } = useAuthStore();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<AccountCode[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const [entityForm, setEntityForm] = useState({ name: "", currency: "GBP", country: "" });
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);

  const isAdmin = org?.role === "admin";

  useEffect(() => {
    loadEntities();
    api.settings.get().then(setSettings).catch(() => {});
    api.settings.getAccounts().then(setAccounts).catch(() => {});
    if (isAdmin) api.auth.getMembers().then(setMembers).catch(() => {});
  }, []);

  const saveSettings = async () => {
    try { await api.settings.update(settings); toast("Settings saved"); }
    catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const saveEntity = async () => {
    try {
      if (editingEntity) {
        await api.entities.update(editingEntity.id, entityForm);
        toast("Entity updated");
      } else {
        await api.entities.create(entityForm);
        toast("Entity created");
      }
      setEntityForm({ name: "", currency: "GBP", country: "" });
      setEditingEntity(null);
      loadEntities();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const deleteEntity = async (id: number) => {
    if (!confirm("Delete entity? This will fail if leases are attached.")) return;
    try { await api.entities.delete(id); loadEntities(); }
    catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const saveAccountCode = async (a: AccountCode) => {
    try {
      await api.settings.updateAccount(a);
      toast("Account codes saved");
      api.settings.getAccounts().then(setAccounts);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const changeRole = async (userId: string, role: string) => {
    try {
      await api.auth.updateMember(userId, role);
      setMembers((ms) => ms.map((m) => m.user_id === userId ? { ...m, role: role as OrgMember["role"] } : m));
      toast("Role updated");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const removeMember = async (userId: string) => {
    if (!confirm("Remove this member from the organisation?")) return;
    try {
      await api.auth.removeMember(userId);
      setMembers((ms) => ms.filter((m) => m.user_id !== userId));
      toast("Member removed");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/* Entities */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">Legal Entities</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Currency</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Country</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entities.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)]">
                    <td className="px-4 py-2">{e.name}</td>
                    <td className="px-4 py-2">{e.currency}</td>
                    <td className="px-4 py-2">{e.country}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditingEntity(e); setEntityForm({ name: e.name, currency: e.currency, country: e.country }); }}
                          className="btn-ghost p-1.5"><Edit2 size={13} /></button>
                        <button onClick={() => deleteEntity(e.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="label">Name</label>
              <input className="input" value={entityForm.name} onChange={(e) => setEntityForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={entityForm.currency} onChange={(e) => setEntityForm((f) => ({ ...f, currency: e.target.value }))}>
                {["GBP","EUR","USD","SEK","NOK","DKK","CHF"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" value={entityForm.country} onChange={(e) => setEntityForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
            <button onClick={saveEntity} className="btn-primary">
              <Plus size={14} /> {editingEntity ? "Update" : "Add"}
            </button>
          </div>
        </div>
      </section>

      {/* Chart of Accounts */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">Chart of Accounts Mapping</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Default codes used in journal generation. One row per entity (leave entity blank for global default).</p>
        </div>
        <div className="p-5 space-y-4">
          {accounts.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No custom account codes configured. Using system defaults.</p>
          )}
          {accounts.map((a) => (
            <AccountCodeRow key={a.id} code={a} entities={entities} onSave={saveAccountCode} />
          ))}
          <AccountCodeRow
            code={{ id: 0, entity_id: null, asset_class: "all",
              rou_asset: "01-1600", accumulated_depreciation: "01-1610",
              lease_liability_current: "01-2300", lease_liability_non_current: "01-2310",
              interest_expense: "01-7100", depreciation_expense: "01-7200", cash_accruals: "01-2100" }}
            entities={entities}
            onSave={saveAccountCode}
            isNew
          />
        </div>
      </section>

      {/* Organisation */}
      {org && (
        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="font-semibold text-sm">Organisation</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{org.name}</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Invite code */}
            <div>
              <label className="label">Invite Code</label>
              <p className="text-xs text-[var(--text-muted)] mb-2">Share this code so others can join your organisation.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 input font-mono text-xs py-2 bg-[var(--bg)] select-all">{org.id}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(org.id); toast("Copied!"); }}
                  className="btn-secondary p-2"
                  title="Copy invite code"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>

            {/* Members (admin only) */}
            {isAdmin && (
              <div>
                <label className="label">Members</label>
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Member</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">Role</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2">
                            <div className="font-medium">{m.name !== "unknown" ? m.name : m.email}</div>
                            <div className="text-xs text-[var(--text-muted)]">{m.email}</div>
                          </td>
                          <td className="px-4 py-2">
                            {m.user_id === user?.id ? (
                              <span className="text-xs text-[var(--text-muted)]">{m.role} (you)</span>
                            ) : (
                              <select
                                className="input py-1 text-xs"
                                value={m.role}
                                onChange={(e) => changeRole(m.user_id, e.target.value)}
                              >
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {m.user_id !== user?.id && (
                              <button
                                onClick={() => removeMember(m.user_id)}
                                className="btn-ghost p-1.5 text-red-500"
                                title="Remove member"
                              >
                                <UserMinus size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!isAdmin && (
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <Shield size={12} /> Only admins can manage members.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Thresholds */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-sm">Low-Value & Short-Term Thresholds</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Low-Value Asset Threshold (USD)</label>
            <input type="number" className="input" value={settings.low_value_threshold_usd || "5000"}
              onChange={(e) => setSettings((s) => ({ ...s, low_value_threshold_usd: e.target.value }))} />
          </div>
          <div>
            <label className="label">Short-Term Lease Threshold (months)</label>
            <input type="number" className="input" value={settings.short_term_threshold_months || "12"}
              onChange={(e) => setSettings((s) => ({ ...s, short_term_threshold_months: e.target.value }))} />
          </div>
        </div>
        <button onClick={saveSettings} className="btn-primary">
          <Save size={14} /> Save Settings
        </button>
      </section>
    </div>
  );
}

function AccountCodeRow({ code, entities, onSave, isNew }: {
  code: AccountCode; entities: Entity[]; onSave: (a: AccountCode) => void; isNew?: boolean;
}) {
  const [form, setForm] = useState(code);
  const set = (k: keyof AccountCode, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
      {isNew && <div className="text-xs font-semibold text-[var(--text-muted)] uppercase">Add New Mapping</div>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Entity</label>
          <select className="input" value={form.entity_id ?? ""}
            onChange={(e) => set("entity_id", e.target.value ? parseInt(e.target.value) : null)}>
            <option value="">Global default</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Asset Class</label>
          <select className="input" value={form.asset_class} onChange={(e) => set("asset_class", e.target.value)}>
            <option value="all">All classes</option>
            <option value="property">Property</option>
            <option value="vehicle">Vehicle</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([
          ["rou_asset", "ROU Asset"],
          ["accumulated_depreciation", "Accum. Depreciation"],
          ["lease_liability_current", "Liability (Current)"],
          ["lease_liability_non_current", "Liability (Non-Current)"],
          ["interest_expense", "Interest Expense"],
          ["depreciation_expense", "Depreciation Expense"],
          ["cash_accruals", "Cash / Accruals"],
        ] as [keyof AccountCode, string][]).map(([k, lbl]) => (
          <div key={k}>
            <label className="label">{lbl}</label>
            <input className="input font-mono text-xs" value={String(form[k] ?? "")}
              onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      <button onClick={() => onSave(form)} className="btn-secondary text-xs py-1 px-3">
        <Save size={12} /> Save
      </button>
    </div>
  );
}
