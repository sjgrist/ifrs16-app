import { useState, useEffect, useMemo } from "react";
import { RefreshCw, Trash2, Edit2, Check, X, Plus, Info } from "lucide-react";
import { api, type FxRate, type Lease } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { fmtDate } from "../lib/utils";

const CCYS = ["GBP","EUR","USD","AUD","CAD","CHF","SEK","NOK","DKK","JPY","SGD","HKD","NZD","CNY","INR","BRL","MXN","ZAR"];

export function FxRatesPage() {
  const { toast } = useToast();
  const [rates, setRates]     = useState<FxRate[]>([]);
  const [leases, setLeases]   = useState<Lease[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Base (reporting) currency for lookups
  const [baseCcy, setBaseCcy] = useState("GBP");

  // Inline edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editDate, setEditDate] = useState("");

  // New-rate form
  const [newForm, setNewForm] = useState({ from_ccy: "", to_ccy: "GBP", rate: "", rate_date: today() });
  const [showAdd, setShowAdd] = useState(false);

  // Unique lease currencies (excl. base)
  const leaseCcys = useMemo(
    () => [...new Set(leases.map((l) => l.currency))].filter((c) => c !== baseCcy).sort(),
    [leases, baseCcy],
  );

  useEffect(() => {
    load();
    api.leases.list().then(({ leases: ls }) => setLeases(ls)).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try { setRates(await api.fxRates.list()); }
    catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }

  // Fetch live rates from Frankfurter for all lease currencies → baseCcy
  async function fetchLiveRates() {
    if (leaseCcys.length === 0) {
      toast("No foreign-currency leases found", "error"); return;
    }
    setFetching(true);
    try {
      // Frankfurter gives base→foreign; we invert to get foreign→base
      const { rates: raw, date } = await api.fxRates.lookup(baseCcy, leaseCcys.join(","));
      // raw = { EUR: 1.17, USD: 1.27 }  meaning 1 GBP = X foreign
      // We want 1 foreign = Y GBP  →  Y = 1 / X
      const saved: FxRate[] = [];
      for (const [foreignCcy, gbpPerForeign] of Object.entries(raw)) {
        const rate = 1 / gbpPerForeign;          // 1 EUR = rate GBP
        const row = await api.fxRates.upsert({
          from_ccy: foreignCcy, to_ccy: baseCcy,
          rate: parseFloat(rate.toFixed(8)),
          rate_date: date, source: "api",
        });
        saved.push(row);
      }
      setRates((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        saved.forEach((r) => map.set(r.id, r));
        return [...map.values()].sort((a, b) => a.from_ccy.localeCompare(b.from_ccy));
      });
      toast(`Fetched ${saved.length} rate${saved.length !== 1 ? "s" : ""} as at ${date}`);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setFetching(false);
    }
  }

  async function saveEdit(r: FxRate) {
    const parsed = parseFloat(editRate);
    if (isNaN(parsed) || parsed <= 0) { toast("Enter a valid rate", "error"); return; }
    try {
      const updated = await api.fxRates.upsert({
        from_ccy: r.from_ccy, to_ccy: r.to_ccy,
        rate: parsed, rate_date: editDate || r.rate_date, source: "manual",
      });
      setRates((prev) => prev.map((x) => x.id === r.id ? updated : x));
      setEditId(null);
      toast("Rate saved");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  }

  async function deleteRate(id: number) {
    if (!confirm("Delete this exchange rate?")) return;
    try {
      await api.fxRates.delete(id);
      setRates((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(newForm.rate);
    if (!newForm.from_ccy || isNaN(parsed) || parsed <= 0) {
      toast("Fill in all fields with a valid rate", "error"); return;
    }
    try {
      const row = await api.fxRates.upsert({
        from_ccy: newForm.from_ccy, to_ccy: newForm.to_ccy,
        rate: parsed, rate_date: newForm.rate_date || today(), source: "manual",
      });
      setRates((prev) => {
        const existing = prev.findIndex((r) => r.id === row.id);
        if (existing >= 0) { const next = [...prev]; next[existing] = row; return next; }
        return [...prev, row].sort((a, b) => a.from_ccy.localeCompare(b.from_ccy));
      });
      setNewForm({ from_ccy: "", to_ccy: baseCcy, rate: "", rate_date: today() });
      setShowAdd(false);
      toast("Rate saved");
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  }

  // Rates missing for detected lease currencies
  const storedPairs = new Set(rates.map((r) => `${r.from_ccy}→${r.to_ccy}`));
  const missingCcys = leaseCcys.filter((c) => !storedPairs.has(`${c}→${baseCcy}`));

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">FX Rates</h1>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-900/20 dark:border-brand-800 px-4 py-3 text-sm text-brand-700 dark:text-brand-300">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span>
          Rates stored here are used automatically in the <strong>Schedules</strong> roll-forward when
          converting lease amounts to your reporting currency. You can fetch live rates or enter them manually.
          Rates are stored as <em>1 foreign = X reporting</em>.
        </span>
      </div>

      {/* Controls */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Reporting / Base Currency</label>
          <select className="input w-24" value={baseCcy} onChange={(e) => setBaseCcy(e.target.value)}>
            {CCYS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1" />
        <button onClick={fetchLiveRates} disabled={fetching || leaseCcys.length === 0}
          className="btn-primary gap-2">
          <RefreshCw size={14} className={fetching ? "animate-spin" : ""} />
          {fetching ? "Fetching…" : `Fetch live rates → ${baseCcy}`}
        </button>
        <button onClick={() => setShowAdd((v) => !v)} className="btn-secondary gap-2">
          <Plus size={14} /> Add rate manually
        </button>
      </div>

      {/* Missing rates warning */}
      {missingCcys.length > 0 && (
        <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-amber-700 dark:text-amber-300">
          Missing rates for lease currencies: <strong>{missingCcys.join(", ")}</strong> → {baseCcy}.
          Click "Fetch live rates" or add them manually.
        </div>
      )}

      {/* Add rate form */}
      {showAdd && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-3">Add / Update Rate</h3>
          <form onSubmit={addRate} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">From</label>
              <select className="input w-24" value={newForm.from_ccy}
                onChange={(e) => setNewForm((f) => ({ ...f, from_ccy: e.target.value }))}>
                <option value="">— pick —</option>
                {CCYS.filter((c) => c !== newForm.to_ccy).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">To</label>
              <select className="input w-24" value={newForm.to_ccy}
                onChange={(e) => setNewForm((f) => ({ ...f, to_ccy: e.target.value }))}>
                {CCYS.filter((c) => c !== newForm.from_ccy).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Rate (1 {newForm.from_ccy || "…"} =)</label>
              <input type="number" step="0.00000001" min="0" className="input w-36 text-right"
                placeholder="0.00000000"
                value={newForm.rate}
                onChange={(e) => setNewForm((f) => ({ ...f, rate: e.target.value }))} />
            </div>
            <div>
              <label className="label">As at</label>
              <input type="date" className="input w-36"
                value={newForm.rate_date}
                onChange={(e) => setNewForm((f) => ({ ...f, rate_date: e.target.value }))} />
            </div>
            <button type="submit" className="btn-primary">Save</button>
            <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          </form>
        </div>
      )}

      {/* Rates table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] text-sm font-semibold">
          Stored Rates {loading && <span className="text-xs font-normal text-[var(--text-muted)] ml-2">Loading…</span>}
        </div>
        {rates.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            No rates stored yet. Fetch live rates or add one manually.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="table-header text-left">Pair</th>
                <th className="table-header">Rate</th>
                <th className="table-header text-left">As at</th>
                <th className="table-header text-left">Source</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)]">
                  <td className="table-cell-left font-mono font-semibold">
                    1 {r.from_ccy} = ? {r.to_ccy}
                  </td>
                  <td className="table-cell text-right font-mono">
                    {editId === r.id ? (
                      <input type="number" step="0.00000001" min="0"
                        className="input w-32 text-right py-0.5 text-xs"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <span className="font-semibold">{Number(r.rate).toFixed(6)}</span>
                    )}
                  </td>
                  <td className="table-cell-left text-xs text-[var(--text-muted)]">
                    {editId === r.id ? (
                      <input type="date" className="input w-32 py-0.5 text-xs"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)} />
                    ) : (
                      fmtDate(r.rate_date)
                    )}
                  </td>
                  <td className="table-cell-left">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      r.source === "api"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-[var(--bg)] text-[var(--text-muted)]"
                    }`}>
                      {r.source}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1 justify-end">
                      {editId === r.id ? (
                        <>
                          <button onClick={() => saveEdit(r)} className="btn-ghost p-1.5 text-emerald-600"><Check size={13} /></button>
                          <button onClick={() => setEditId(null)} className="btn-ghost p-1.5"><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(r.id); setEditRate(String(r.rate)); setEditDate(r.rate_date); }}
                            className="btn-ghost p-1.5"><Edit2 size={13} /></button>
                          <button onClick={() => deleteRate(r.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 size={13} /></button>
                        </>
                      )}
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

function today() {
  return new Date().toISOString().slice(0, 10);
}
