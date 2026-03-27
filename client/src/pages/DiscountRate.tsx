import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { api, type DiscountRate } from "../lib/api";
import { fmtPct, fmt } from "../lib/utils";
import { Modal } from "../components/ui/Modal";
import { useToast } from "../components/ui/Toast";
import { useAppStore } from "../lib/store";

const CURRENCIES = ["GBP", "EUR", "USD", "SEK", "NOK", "DKK", "CHF"];
const METHODOLOGY: Record<number, { title: string; body: string; guidance?: string }> = {
  1: {
    title: "Step 1 — Reference Rate",
    body: "The reference rate is the risk-free rate for the relevant currency and tenor. Common references:\n• GBP: SONIA (Sterling Overnight Index Average)\n• EUR: EURIBOR / €STER\n• SEK: STIBOR\n• NOK: NIBOR\n• USD: SOFR\n\nChoose the tenor closest to your lease term. For terms between published tenors, interpolate linearly.",
    guidance: "IFRS 16 requires the rate to reflect the currency of the lease, the payment schedule, and the term.",
  },
  2: {
    title: "Step 2 — Credit Spread",
    body: "The credit spread reflects the lessee's credit risk above the risk-free rate. Sources:\n• Existing bank facilities: margin over SONIA/EURIBOR\n• Credit rating implied spreads (e.g. ICE BofA indices)\n• Comparable company bond yields\n\nIf no rated debt exists, use the margin on the most recent bank facility as a proxy.",
    guidance: "This produces the unsecured borrowing rate = base rate + credit spread.",
  },
  3: {
    title: "Step 3 — Security Adjustment",
    body: "Leases are typically secured on the underlying asset (the lessor has a right to repossess). This reduces the credit risk to the lender versus unsecured borrowing.\n\nTypically a downward adjustment of 0–100 bps depending on asset quality and marketability.\n• Property: often 25–75 bps reduction\n• Vehicles/Equipment: 0–50 bps reduction",
    guidance: "IFRS 16.BC160 confirms the IBR should reflect a secured rate where the lease is secured on the underlying asset.",
  },
  4: {
    title: "Step 4 — Currency Adjustment",
    body: "If the lease payments are in a different currency from the lessee's functional currency:\n• Use a rate denominated in the payment currency (e.g. USD SOFR if payments are in USD)\n• Do NOT add a foreign exchange risk premium — the IBR is the borrowing rate in the lease currency\n\nIf local-currency rates are unavailable, adjust the functional-currency rate using interest rate parity principles.",
    guidance: "The IBR should be the rate the lessee would pay to borrow in the same currency as the lease payments.",
  },
};

export function DiscountRatePage() {
  const { toast } = useToast();
  const { rates, loadRates } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DiscountRate | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(1);

  // Workbench state
  const [wb, setWb] = useState({
    label: "", currency: "GBP", tenor_months: 36,
    base_rate: 0, credit_spread: 0, security_adj: 0,
    effective_date: new Date().toISOString().slice(0, 10), notes: "",
  });

  useEffect(() => { loadRates(); }, []);

  const ibr = wb.base_rate + wb.credit_spread - wb.security_adj;

  const handleSave = async () => {
    try {
      const data = { ...wb, ibr };
      if (editing) {
        await api.rates.update(editing.id, data);
        toast("Rate updated");
      } else {
        await api.rates.create(data);
        toast("Rate saved to library");
      }
      setShowForm(false); setEditing(null);
      loadRates();
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this rate?")) return;
    try { await api.rates.delete(id); loadRates(); } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  const setNum = (field: keyof typeof wb, v: string) =>
    setWb((w) => ({ ...w, [field]: parseFloat(v) || 0 }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Discount Rate Workbench</h1>
      </div>

      {/* Workbench steps */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-sm">IBR Builder — Step by Step</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Work through each step to determine the Incremental Borrowing Rate (IBR) per IFRS 16.26</p>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {[1,2,3,4].map((step) => {
            const meta = METHODOLOGY[step];
            const isOpen = expandedStep === step;
            return (
              <div key={step}>
                <button className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--bg)] transition-colors"
                  onClick={() => setExpandedStep(isOpen ? null : step)}>
                  <span className="font-medium text-sm flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center font-bold">{step}</span>
                    {meta.title}
                  </span>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 space-y-4">
                    <div className="bg-[var(--bg)] rounded-lg p-4 text-sm space-y-2">
                      {meta.body.split("\n").map((line, i) => (
                        <p key={i} className={line.startsWith("•") ? "ml-4 text-[var(--text-muted)]" : ""}>{line}</p>
                      ))}
                      {meta.guidance && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                          <Info size={14} className="text-brand-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-[var(--text-muted)] italic">{meta.guidance}</p>
                        </div>
                      )}
                    </div>

                    {/* Input for each step */}
                    {step === 1 && (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="label">Currency</label>
                          <select className="input" value={wb.currency}
                            onChange={(e) => setWb((w) => ({ ...w, currency: e.target.value }))}>
                            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Tenor (months)</label>
                          <input type="number" className="input" value={wb.tenor_months}
                            onChange={(e) => setNum("tenor_months", e.target.value)} />
                        </div>
                        <div>
                          <label className="label">Base Risk-Free Rate</label>
                          <div className="relative">
                            <input type="number" className="input pr-8" step="0.0001" min={-0.1} max={0.5}
                              value={wb.base_rate} onChange={(e) => setNum("base_rate", e.target.value)} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                              {fmtPct(wb.base_rate)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    {step === 2 && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label">Credit Spread</label>
                          <div className="relative">
                            <input type="number" className="input pr-8" step="0.0001" min={0} max={0.2}
                              value={wb.credit_spread} onChange={(e) => setNum("credit_spread", e.target.value)} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                              {fmtPct(wb.credit_spread)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-end pb-1">
                          <div className="text-sm">
                            <div className="label">Unsecured rate</div>
                            <div className="font-mono font-semibold">{fmtPct(wb.base_rate + wb.credit_spread)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {step === 3 && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="label">Security Adjustment (reduction)</label>
                          <div className="relative">
                            <input type="number" className="input pr-8" step="0.0001" min={0} max={0.02}
                              value={wb.security_adj} onChange={(e) => setNum("security_adj", e.target.value)} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
                              {fmtPct(wb.security_adj)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    {step === 4 && (
                      <div className="text-sm text-[var(--text-muted)]">
                        Currency selected: <strong className="text-[var(--text)]">{wb.currency}</strong>. Ensure the base rate
                        in Step 1 is denominated in {wb.currency}. No additional input required.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* IBR Summary */}
        <div className="px-6 py-5 bg-brand-50 dark:bg-brand-900/20 border-t border-brand-200 dark:border-brand-800">
          <h3 className="font-semibold text-sm mb-3">Step 5 — IBR Summary</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-sm font-mono space-x-2">
              <span>{fmtPct(wb.base_rate)}</span>
              <span className="text-[var(--text-muted)]">base</span>
              <span>+</span>
              <span>{fmtPct(wb.credit_spread)}</span>
              <span className="text-[var(--text-muted)]">spread</span>
              <span>−</span>
              <span>{fmtPct(wb.security_adj)}</span>
              <span className="text-[var(--text-muted)]">security</span>
              <span>=</span>
              <span className="text-brand-600 dark:text-brand-400 font-bold text-lg">{fmtPct(ibr)}</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <input className="input w-48" placeholder="Label for this rate…"
                value={wb.label} onChange={(e) => setWb((w) => ({ ...w, label: e.target.value }))} />
              <input type="date" className="input w-40" value={wb.effective_date}
                onChange={(e) => setWb((w) => ({ ...w, effective_date: e.target.value }))} />
              <button onClick={handleSave} className="btn-primary" disabled={!wb.label}>
                Save to Library
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rate library */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="font-semibold text-sm">Rate Library</h2>
        </div>
        {rates.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)]">No rates saved yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left">Label</th>
                <th className="table-header text-left">Ccy</th>
                <th className="table-header">Tenor</th>
                <th className="table-header">Base</th>
                <th className="table-header">Spread</th>
                <th className="table-header">Security adj.</th>
                <th className="table-header">IBR</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                  <td className="table-cell-left font-medium">{r.label}</td>
                  <td className="table-cell-left">{r.currency}</td>
                  <td className="table-cell">{r.tenor_months}mo</td>
                  <td className="table-cell font-mono">{fmtPct(r.base_rate)}</td>
                  <td className="table-cell font-mono">{fmtPct(r.credit_spread)}</td>
                  <td className="table-cell font-mono">({fmtPct(r.security_adj)})</td>
                  <td className="table-cell font-mono font-semibold text-brand-600 dark:text-brand-400">{fmtPct(r.ibr)}</td>
                  <td className="table-cell-left text-xs text-[var(--text-muted)]">{r.effective_date}</td>
                  <td className="table-cell-left">
                    <div className="flex gap-1">
                      <button onClick={() => {
                        setWb({ label: r.label, currency: r.currency, tenor_months: r.tenor_months,
                          base_rate: r.base_rate, credit_spread: r.credit_spread, security_adj: r.security_adj,
                          effective_date: r.effective_date, notes: r.notes });
                        setEditing(r);
                      }} className="btn-ghost p-1.5"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(r.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
