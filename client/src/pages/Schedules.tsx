import { useState, useEffect, useMemo, Fragment } from "react";
import { ArrowLeftRight, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type RollForwardRow } from "../lib/api";
import { useAppStore } from "../lib/store";
import { downloadBlob, fmtDate } from "../lib/utils";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const CCYS = ["GBP","EUR","USD","AUD","CAD","CHF","SEK","NOK","DKK","JPY","SGD","HKD","NZD","CNY","INR","BRL","MXN","ZAR"];
const SCALES = [
  { value: 1,         label: "Units" },
  { value: 1_000,     label: "Thousands" },
  { value: 1_000_000, label: "Millions" },
];

// Scale + round to integer, localised
function fmtN(amount: number | null, scale: number): string {
  if (amount === null) return "—";
  return Math.round(amount / scale).toLocaleString("en-GB");
}

function toRpt(amount: number, nativeCcy: string, reportingCcy: string, rates: Record<string, number>): number | null {
  if (nativeCcy === reportingCcy) return amount;
  const r = rates[nativeCcy];
  return r ? amount * r : null;
}

// ─── Style tokens ─────────────────────────────────────────────────────────────
// Native group  →  cool slate
const N = {
  groupHd:  "bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300",
  subHd:    "bg-slate-50  dark:bg-slate-800/60 text-slate-500 dark:text-slate-400",
  cell:     "text-slate-700 dark:text-slate-300 bg-white dark:bg-transparent",
  totalHd:  "bg-slate-100 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500",
};
// Reporting group  →  warm indigo
const R = {
  groupHd:  "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300",
  subHd:    "bg-indigo-50  dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400",
  cell:     "text-indigo-900 dark:text-indigo-100 bg-indigo-50/40 dark:bg-indigo-900/10",
  totalCell:"bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 font-bold",
  divider:  "border-l-2 border-indigo-200 dark:border-indigo-700",
};

const SORT_OPTIONS = [
  { value: "entity",          label: "Group by entity" },
  { value: "asset",           label: "Sort by asset" },
  { value: "currency",        label: "Sort by currency" },
  { value: "liability_desc",  label: "Liability ↓" },
  { value: "liability_asc",   label: "Liability ↑" },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export function SchedulesPage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const [rollForward, setRollForward] = useState<RollForwardRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState({
    entity_id: "",
    period_start: new Date().getFullYear() + "-01-01",
    period_end:   new Date().getFullYear() + "-12-31",
  });
  const [reportingCcy, setReportingCcy] = useState("GBP");
  const [scale, setScale]               = useState(1);
  const [sortBy, setSortBy]             = useState("entity");
  const [rawOverrides, setRawOverrides] = useState<Record<string, string>>({});
  const [storedRates, setStoredRates]   = useState<Record<string, { rate: number; date: string }>>({});

  useEffect(() => { loadEntities(); }, []);

  const effectiveRates = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [c, info] of Object.entries(storedRates)) out[c] = info.rate;
    for (const [c, raw]  of Object.entries(rawOverrides)) { const n = parseFloat(raw); if (n > 0) out[c] = n; }
    return out;
  }, [storedRates, rawOverrides]);

  const foreignCcys = useMemo(
    () => [...new Set(rollForward.map((r) => r.currency))].filter((c) => c !== reportingCcy).sort(),
    [rollForward, reportingCcy],
  );

  async function loadStoredRates(fCcys: string[], base: string) {
    if (!fCcys.length) { setStoredRates({}); return; }
    try {
      const all = await api.fxRates.list();
      const map: Record<string, { rate: number; date: string }> = {};
      for (const r of all) {
        if (r.to_ccy === base && r.from_ccy !== base) map[r.from_ccy] = { rate: Number(r.rate), date: r.rate_date };
      }
      setStoredRates(map);
      setRawOverrides((prev) => { const n = { ...prev }; for (const c of Object.keys(map)) delete n[c]; return n; });
    } catch { /* silent */ }
  }

  const generate = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { period_start: filter.period_start, period_end: filter.period_end };
      if (filter.entity_id) params.entity_id = filter.entity_id;
      const rows = await api.schedules.rollforward(params);
      setRollForward(rows);
      const fCcys = [...new Set(rows.map((r) => r.currency))].filter((c) => c !== reportingCcy);
      await loadStoredRates(fCcys, reportingCcy);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (rollForward.length) { loadStoredRates(foreignCcys, reportingCcy); setRawOverrides({}); }
  }, [reportingCcy]);

  // Augment rows with reporting equivalents
  const rows = useMemo(() =>
    rollForward.map((r) => ({
      ...r,
      rpt: {
        openingRou:                 toRpt(r.openingRou,                 r.currency, reportingCcy, effectiveRates),
        additionsRou:               toRpt(r.additionsRou,               r.currency, reportingCcy, effectiveRates),
        depreciationRou:            toRpt(r.depreciationRou,            r.currency, reportingCcy, effectiveRates),
        closingRou:                 toRpt(r.closingRou,                 r.currency, reportingCcy, effectiveRates),
        openingLiability:           toRpt(r.openingLiability,           r.currency, reportingCcy, effectiveRates),
        additionsLiability:         toRpt(r.additionsLiability,         r.currency, reportingCcy, effectiveRates),
        interestLiability:          toRpt(r.interestLiability,          r.currency, reportingCcy, effectiveRates),
        paymentsLiability:          toRpt(r.paymentsLiability,          r.currency, reportingCcy, effectiveRates),
        closingLiability:           toRpt(r.closingLiability,           r.currency, reportingCcy, effectiveRates),
        closingCurrentLiability:    toRpt(r.closingCurrentLiability,    r.currency, reportingCcy, effectiveRates),
        closingNonCurrentLiability: toRpt(r.closingNonCurrentLiability, r.currency, reportingCcy, effectiveRates),
      },
    })),
    [rollForward, reportingCcy, effectiveRates],
  );

  const totals = useMemo(() => {
    const z = { openingRou:0,additionsRou:0,depreciationRou:0,closingRou:0,
                openingLiability:0,additionsLiability:0,interestLiability:0,
                paymentsLiability:0,closingLiability:0,
                closingCurrentLiability:0,closingNonCurrentLiability:0 };
    return rows.reduce((acc, r) => {
      if (r.rpt.closingRou === null) return acc;
      return {
        openingRou:                 acc.openingRou                 + (r.rpt.openingRou                 ?? 0),
        additionsRou:               acc.additionsRou               + (r.rpt.additionsRou               ?? 0),
        depreciationRou:            acc.depreciationRou            + (r.rpt.depreciationRou            ?? 0),
        closingRou:                 acc.closingRou                 + (r.rpt.closingRou                 ?? 0),
        openingLiability:           acc.openingLiability           + (r.rpt.openingLiability           ?? 0),
        additionsLiability:         acc.additionsLiability         + (r.rpt.additionsLiability         ?? 0),
        interestLiability:          acc.interestLiability          + (r.rpt.interestLiability          ?? 0),
        paymentsLiability:          acc.paymentsLiability          + (r.rpt.paymentsLiability          ?? 0),
        closingLiability:           acc.closingLiability           + (r.rpt.closingLiability           ?? 0),
        closingCurrentLiability:    acc.closingCurrentLiability    + (r.rpt.closingCurrentLiability    ?? 0),
        closingNonCurrentLiability: acc.closingNonCurrentLiability + (r.rpt.closingNonCurrentLiability ?? 0),
      };
    }, z);
  }, [rows]);

  // Sorted / grouped rows
  const sortedRows = useMemo(() => {
    const r = [...rows];
    switch (sortBy) {
      case "entity":
        return r.sort((a, b) => {
          const e = (a.entity || "").localeCompare(b.entity || "");
          return e !== 0 ? e : a.assetDescription.localeCompare(b.assetDescription);
        });
      case "asset":
        return r.sort((a, b) => a.assetDescription.localeCompare(b.assetDescription));
      case "currency":
        return r.sort((a, b) => a.currency.localeCompare(b.currency));
      case "liability_desc":
        return r.sort((a, b) => b.closingLiability - a.closingLiability);
      case "liability_asc":
        return r.sort((a, b) => a.closingLiability - b.closingLiability);
      default:
        return r;
    }
  }, [rows, sortBy]);

  const groupByEntity  = sortBy === "entity";
  const convertedCount = rows.filter((r) => r.rpt.closingRou !== null).length;
  const missingRates   = foreignCcys.filter((c) => !effectiveRates[c]);
  const scaleSuffix    = scale > 1 ? ` (${SCALES.find((s) => s.value === scale)!.label})` : "";
  const hasMultiCcy    = foreignCcys.length > 0;

  const exportXlsx = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const addSheet = (name: string, hdrs: string[], fn: (r: typeof rows[number]) => (string | number)[]) => {
        const ws = wb.addWorksheet(name);
        ws.addRow(hdrs);
        rows.forEach((r) => ws.addRow(fn(r)));
      };
      addSheet("ROU Asset",
        ["Entity","Asset","Lessor","Ccy","Opening","Additions","Depreciation","Closing",
         `Opening (${reportingCcy})`,`Additions (${reportingCcy})`,`Depreciation (${reportingCcy})`,`Closing (${reportingCcy})`],
        (r) => [r.entity,r.assetDescription,r.lessorName,r.currency,
          Math.round(r.openingRou/scale),Math.round(r.additionsRou/scale),Math.round(r.depreciationRou/scale),Math.round(r.closingRou/scale),
          r.rpt.openingRou!==null?Math.round(r.rpt.openingRou/scale):"N/A",
          r.rpt.additionsRou!==null?Math.round(r.rpt.additionsRou/scale):"N/A",
          r.rpt.depreciationRou!==null?Math.round(r.rpt.depreciationRou/scale):"N/A",
          r.rpt.closingRou!==null?Math.round(r.rpt.closingRou/scale):"N/A"],
      );
      addSheet("Lease Liability",
        ["Entity","Asset","Lessor","Ccy","Opening","Additions","Interest","Payments","Closing",
         `Opening (${reportingCcy})`,`Additions (${reportingCcy})`,`Interest (${reportingCcy})`,`Payments (${reportingCcy})`,`Closing (${reportingCcy})`],
        (r) => [r.entity,r.assetDescription,r.lessorName,r.currency,
          Math.round(r.openingLiability/scale),Math.round(r.additionsLiability/scale),Math.round(r.interestLiability/scale),Math.round(r.paymentsLiability/scale),Math.round(r.closingLiability/scale),
          r.rpt.openingLiability!==null?Math.round(r.rpt.openingLiability/scale):"N/A",
          r.rpt.additionsLiability!==null?Math.round(r.rpt.additionsLiability/scale):"N/A",
          r.rpt.interestLiability!==null?Math.round(r.rpt.interestLiability/scale):"N/A",
          r.rpt.paymentsLiability!==null?Math.round(r.rpt.paymentsLiability/scale):"N/A",
          r.rpt.closingLiability!==null?Math.round(r.rpt.closingLiability/scale):"N/A"],
      );
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), `rollforward-${filter.period_end}.xlsx`);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedules &amp; Roll-Forward</h1>
        {rows.length > 0 && <button onClick={exportXlsx} className="btn-secondary text-xs">Export XLSX</button>}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-3 flex-wrap items-end">
        <div>
          <label className="label">Entity</label>
          <select className="input w-40" value={filter.entity_id}
            onChange={(e) => setFilter((f) => ({ ...f, entity_id: e.target.value }))}>
            <option value="">All entities</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Period Start</label>
          <input type="date" className="input w-36" value={filter.period_start}
            onChange={(e) => setFilter((f) => ({ ...f, period_start: e.target.value }))} />
        </div>
        <div>
          <label className="label">Period End</label>
          <input type="date" className="input w-36" value={filter.period_end}
            onChange={(e) => setFilter((f) => ({ ...f, period_end: e.target.value }))} />
        </div>
        <div>
          <label className="label">Reporting Ccy</label>
          <select className="input w-20" value={reportingCcy}
            onChange={(e) => setReportingCcy(e.target.value)}>
            {CCYS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Scale</label>
          <select className="input w-32" value={scale}
            onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Sort / Group</label>
          <select className="input w-40" value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <button onClick={generate} className="btn-primary" disabled={loading}>
          {loading ? <Spinner className="w-4 h-4" /> : null} Generate
        </button>
      </div>

      {/* FX panel */}
      {rows.length > 0 && hasMultiCcy && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Exchange Rates → {reportingCcy}</span>
            <Link to="/fx-rates" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              <ArrowLeftRight size={11} /> Manage FX Rates
            </Link>
          </div>
          {missingRates.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={12} />
              No stored rate for <strong>{missingRates.join(", ")}</strong> — those rows excluded from {reportingCcy} totals.
            </p>
          )}
          <div className="flex flex-wrap gap-5">
            {foreignCcys.map((ccy) => {
              const stored = storedRates[ccy];
              const hasOv  = ccy in rawOverrides;
              return (
                <div key={ccy} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[var(--text-muted)]">1 {ccy} =</span>
                  <input type="number" step="0.0001" min="0" placeholder="0.0000"
                    className={`input w-24 text-right py-1 text-xs ${stored && !hasOv ? "text-[var(--text-muted)]" : ""}`}
                    value={hasOv ? rawOverrides[ccy] : (stored ? String(stored.rate) : "")}
                    onChange={(e) => setRawOverrides((r) => ({ ...r, [ccy]: e.target.value }))}
                    onBlur={(e) => { if (!e.target.value && stored) setRawOverrides((r) => { const n={...r}; delete n[ccy]; return n; }); }}
                  />
                  <span className="font-mono">{reportingCcy}</span>
                  {stored && !hasOv && <span className="text-[var(--text-muted)]">({fmtDate(stored.date)})</span>}
                  {hasOv && <button className="text-[var(--text-muted)] hover:underline"
                    onClick={() => setRawOverrides((r) => { const n={...r}; delete n[ccy]; return n; })}>reset</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tables */}
      {rows.length > 0 && (
        <>
          <DualCcyTable
            title="Right-of-Use Asset Roll-Forward"
            reportingCcy={reportingCcy} scale={scale} scaleSuffix={scaleSuffix}
            convertedCount={convertedCount} totalCount={rows.length}
            hasMultiCcy={hasMultiCcy} groupByEntity={groupByEntity}
            cols={[
              { label: "Opening",      nativeKey: "openingRou",      rptKey: "openingRou",      color: "",                                            parenNative: false, parenRpt: false },
              { label: "Additions",    nativeKey: "additionsRou",    rptKey: "additionsRou",    color: "text-emerald-700 dark:text-emerald-400",       parenNative: false, parenRpt: false },
              { label: "Depreciation", nativeKey: "depreciationRou", rptKey: "depreciationRou", color: "text-rose-600 dark:text-rose-400",             parenNative: true,  parenRpt: true  },
              { label: "Closing",      nativeKey: "closingRou",      rptKey: "closingRou",      color: "font-semibold",                               parenNative: false, parenRpt: false },
            ]}
            rows={sortedRows.map((r) => ({ ...r, native: r, rpt: r.rpt }))}
            rptTotals={{
              openingRou: totals.openingRou, additionsRou: totals.additionsRou,
              depreciationRou: totals.depreciationRou, closingRou: totals.closingRou,
            }}
          />
          <DualCcyTable
            title="Lease Liability Roll-Forward"
            reportingCcy={reportingCcy} scale={scale} scaleSuffix={scaleSuffix}
            convertedCount={convertedCount} totalCount={rows.length}
            hasMultiCcy={hasMultiCcy} groupByEntity={groupByEntity}
            cols={[
              { label: "Opening",   nativeKey: "openingLiability",   rptKey: "openingLiability",   color: "",                                          parenNative: false, parenRpt: false },
              { label: "Additions", nativeKey: "additionsLiability", rptKey: "additionsLiability", color: "text-emerald-700 dark:text-emerald-400",     parenNative: false, parenRpt: false },
              { label: "Interest",  nativeKey: "interestLiability",  rptKey: "interestLiability",  color: "text-amber-600 dark:text-amber-400",         parenNative: false, parenRpt: false },
              { label: "Payments",  nativeKey: "paymentsLiability",  rptKey: "paymentsLiability",  color: "text-rose-600 dark:text-rose-400",           parenNative: true,  parenRpt: true  },
              { label: "Closing",   nativeKey: "closingLiability",   rptKey: "closingLiability",   color: "font-semibold",                             parenNative: false, parenRpt: false },
            ]}
            rows={sortedRows.map((r) => ({ ...r, native: r, rpt: r.rpt }))}
            rptTotals={{
              openingLiability: totals.openingLiability, additionsLiability: totals.additionsLiability,
              interestLiability: totals.interestLiability, paymentsLiability: totals.paymentsLiability,
              closingLiability: totals.closingLiability,
            }}
          />

          {/* Current / Non-current split */}
          <CurrentNonCurrentTable
            title={`Lease Liability — Current / Non-Current Split at ${filter.period_end}`}
            reportingCcy={reportingCcy} scale={scale} scaleSuffix={scaleSuffix}
            hasMultiCcy={hasMultiCcy} groupByEntity={groupByEntity}
            rows={sortedRows}
            totals={totals}
          />
        </>
      )}

      {rows.length === 0 && !loading && (
        <div className="card p-12 text-center text-[var(--text-muted)] text-sm">
          Select a period and click Generate to build the roll-forward report.
        </div>
      )}
    </div>
  );
}

// ─── Current / Non-current split table ───────────────────────────────────────

type AugRowWithSplit = RollForwardRow & {
  rpt: Record<string, number | null>;
};

function CurrentNonCurrentTable({ title, reportingCcy, scale, scaleSuffix, hasMultiCcy, groupByEntity, rows, totals }: {
  title: string;
  reportingCcy: string;
  scale: number;
  scaleSuffix: string;
  hasMultiCcy: boolean;
  groupByEntity: boolean;
  rows: AugRowWithSplit[];
  totals: Record<string, number>;
}) {
  const totalCols = 3 + 3 + (hasMultiCcy ? 3 : 0);
  // ── Teal palette for current/non-current ──
  const C = {
    groupHd:  "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300",
    subHd:    "bg-teal-50  dark:bg-teal-900/20 text-teal-600 dark:text-teal-400",
    curr:     "text-teal-800 dark:text-teal-200 bg-teal-50/60 dark:bg-teal-900/10",
    nonCurr:  "text-slate-700 dark:text-slate-300 bg-white dark:bg-transparent",
    total:    "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 font-bold",
    divider:  "border-l-2 border-teal-200 dark:border-teal-700",
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          IFRS 16 — current portion = amounts due within 12 months of period end
          {scale > 1 && <span className="ml-1">· {SCALES.find((s) => s.value === scale)!.label}</span>}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "11px" }}>
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "5%" }} />
            <col /><col /><col />
            {hasMultiCcy && <><col /><col /><col /></>}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Entity</th>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Asset</th>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Ccy</th>
              <th colSpan={3}
                className={`px-3 py-1 text-center font-semibold tracking-wide uppercase text-[10px] border-b border-[var(--border)] ${N.groupHd}`}>
                Native Currency
              </th>
              {hasMultiCcy && (
                <th colSpan={3}
                  className={`px-3 py-1 text-center font-semibold tracking-wide uppercase text-[10px] border-b border-l-2 border-[var(--border)] border-l-teal-300 dark:border-l-teal-600 ${C.groupHd}`}>
                  {reportingCcy}{scaleSuffix} equivalent
                </th>
              )}
            </tr>
            <tr>
              <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${N.subHd}`}>Total</th>
              <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${N.subHd}`}>Current (&lt;12m)</th>
              <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${N.subHd}`}>Non-current (&gt;12m)</th>
              {hasMultiCcy && (
                <>
                  <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${C.subHd} border-l-2 border-l-teal-200 dark:border-l-teal-700`}>Total</th>
                  <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${C.subHd}`}>Current (&lt;12m)</th>
                  <th className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${C.subHd}`}>Non-current (&gt;12m)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const noRate = r.rpt.closingLiability === null;
              const showGroupHd = groupByEntity && (i === 0 || rows[i - 1].entity !== r.entity);
              return (
                <Fragment key={r.leaseId}>
                  {showGroupHd && (
                    <tr className="bg-brand-50 dark:bg-brand-900/20 border-b border-[var(--border)]">
                      <td colSpan={totalCols}
                        className="px-3 py-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 tracking-wide uppercase">
                        {r.entity || "—"}
                      </td>
                    </tr>
                  )}
                <tr
                  className={`border-b border-[var(--border)] hover:brightness-95 dark:hover:brightness-110 ${noRate ? "opacity-60" : ""}`}>
                  <td className={`px-3 py-1.5 ${N.cell} ${groupByEntity ? "text-[var(--text-muted)] text-[10px]" : ""}`}>{groupByEntity ? "" : (r.entity || "—")}</td>
                  <td className={`px-3 py-1.5 truncate max-w-[140px] ${N.cell}`} title={r.assetDescription}>{r.assetDescription}</td>
                  <td className={`px-3 py-1.5 font-mono font-semibold ${N.cell}`}>{r.currency}</td>
                  {/* Native */}
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${N.cell}`}>{fmtN(r.closingLiability, scale)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${C.curr}`}>{fmtN(r.closingCurrentLiability, scale)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${C.nonCurr}`}>{fmtN(r.closingNonCurrentLiability, scale)}</td>
                  {/* Reporting */}
                  {hasMultiCcy && (
                    <>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${R.cell} ${R.divider}`}>
                        {r.rpt.closingLiability === null ? <span className="text-[var(--text-muted)]">—</span> : fmtN(r.rpt.closingLiability as number, scale)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${C.curr} bg-teal-50/40 dark:bg-teal-900/10`}>
                        {r.rpt.closingCurrentLiability === null ? <span className="text-[var(--text-muted)]">—</span> : fmtN(r.rpt.closingCurrentLiability as number, scale)}
                      </td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${R.cell}`}>
                        {r.rpt.closingNonCurrentLiability === null ? <span className="text-[var(--text-muted)]">—</span> : fmtN(r.rpt.closingNonCurrentLiability as number, scale)}
                      </td>
                    </>
                  )}
                </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-semibold">
              <td colSpan={3} className={`px-3 py-1.5 ${N.totalHd}`}>
                {hasMultiCcy ? "Total" : `Total${scaleSuffix}`}
              </td>
              {/* Native totals */}
              <td className={`px-3 py-1.5 text-right ${N.totalHd}`}>
                {hasMultiCcy ? <span className="opacity-40">—</span>
                  : fmtN(rows.reduce((s, r) => s + r.closingLiability, 0), scale)}
              </td>
              <td className={`px-3 py-1.5 text-right ${N.totalHd}`}>
                {hasMultiCcy ? <span className="opacity-40">—</span>
                  : fmtN(rows.reduce((s, r) => s + r.closingCurrentLiability, 0), scale)}
              </td>
              <td className={`px-3 py-1.5 text-right ${N.totalHd}`}>
                {hasMultiCcy ? <span className="opacity-40">—</span>
                  : fmtN(rows.reduce((s, r) => s + r.closingNonCurrentLiability, 0), scale)}
              </td>
              {/* Reporting totals */}
              {hasMultiCcy && (
                <>
                  <td className={`px-3 py-1.5 text-right ${R.totalCell} ${R.divider}`}>{fmtN(totals.closingLiability, scale)}</td>
                  <td className={`px-3 py-1.5 text-right ${C.total}`}>{fmtN(totals.closingCurrentLiability, scale)}</td>
                  <td className={`px-3 py-1.5 text-right ${R.totalCell}`}>{fmtN(totals.closingNonCurrentLiability, scale)}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Dual-currency table ──────────────────────────────────────────────────────

interface ColSpec {
  label: string;
  nativeKey: string;
  rptKey: string;
  color: string;
  parenNative: boolean;
  parenRpt: boolean;
}

type AugRow = RollForwardRow & {
  native: RollForwardRow;
  rpt: Record<string, number | null>;
};

function DualCcyTable({ title, reportingCcy, scale, scaleSuffix, convertedCount, totalCount,
                        hasMultiCcy, groupByEntity, cols, rows, rptTotals }: {
  title: string;
  reportingCcy: string;
  scale: number;
  scaleSuffix: string;
  convertedCount: number;
  totalCount: number;
  hasMultiCcy: boolean;
  groupByEntity: boolean;
  cols: ColSpec[];
  rows: AugRow[];
  rptTotals: Record<string, number>;
}) {
  const nc = cols.length; // column count per group
  const totalCols = 3 + nc + (hasMultiCcy ? nc : 0);
  const excl = convertedCount < totalCount;

  return (
    <div className="card overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          Amounts rounded to nearest whole {scale > 1 ? `${SCALES.find((s)=>s.value===scale)!.label.toLowerCase()}` : "unit"}
          {excl && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              · {totalCount - convertedCount} row{totalCount - convertedCount > 1 ? "s" : ""} missing FX rate
            </span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "11px" }}>
          <colgroup>
            {/* Row descriptor cols */}
            <col style={{ width: "10%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "5%"  }} />
            {/* Native cols */}
            {cols.map((_, i) => <col key={"n"+i} />)}
            {/* Reporting cols — only if multi-ccy */}
            {hasMultiCcy && cols.map((_, i) => <col key={"r"+i} />)}
          </colgroup>

          <thead>
            {/* ── Group header row ── */}
            <tr>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Entity</th>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Asset</th>
              <th rowSpan={2} className={`px-3 py-1.5 text-left border-b border-[var(--border)] ${N.subHd}`}>Ccy</th>
              <th colSpan={nc}
                className={`px-3 py-1 text-center font-semibold tracking-wide uppercase text-[10px] border-b border-[var(--border)] ${N.groupHd}`}>
                Native Currency
              </th>
              {hasMultiCcy && (
                <th colSpan={nc}
                  className={`px-3 py-1 text-center font-semibold tracking-wide uppercase text-[10px] border-b border-l-2 border-[var(--border)] border-l-indigo-300 dark:border-l-indigo-600 ${R.groupHd}`}>
                  {reportingCcy}{scaleSuffix} equivalent
                </th>
              )}
            </tr>
            {/* ── Sub-header row ── */}
            <tr>
              {cols.map((c) => (
                <th key={"nh"+c.label}
                  className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${N.subHd}`}>
                  {c.label}
                </th>
              ))}
              {hasMultiCcy && cols.map((c, i) => (
                <th key={"rh"+c.label}
                  className={`px-3 py-1 text-right whitespace-nowrap border-b border-[var(--border)] ${R.subHd} ${i === 0 ? R.divider : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => {
              const noRate = r.rpt[cols[cols.length - 1].rptKey] === null;
              const showGroupHd = groupByEntity && (i === 0 || rows[i - 1].entity !== r.entity);
              return (
                <Fragment key={r.leaseId}>
                  {showGroupHd && (
                    <tr className="bg-brand-50 dark:bg-brand-900/20 border-b border-[var(--border)]">
                      <td colSpan={totalCols}
                        className="px-3 py-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 tracking-wide uppercase">
                        {r.entity || "—"}
                      </td>
                    </tr>
                  )}
                  <tr className={`border-b border-[var(--border)] hover:brightness-95 dark:hover:brightness-110 ${noRate ? "opacity-60" : ""}`}>
                    <td className={`px-3 py-1.5 ${N.cell} ${groupByEntity ? "text-[var(--text-muted)] text-[10px]" : ""}`}>{groupByEntity ? "" : (r.entity || "—")}</td>
                    <td className={`px-3 py-1.5 truncate max-w-[140px] ${N.cell}`} title={r.assetDescription}>{r.assetDescription}</td>
                    <td className={`px-3 py-1.5 font-mono font-semibold ${N.cell}`}>{r.currency}</td>

                    {/* Native values */}
                    {cols.map((c) => {
                      const v = (r.native as unknown as Record<string, number>)[c.nativeKey];
                      return (
                        <td key={"nv"+c.label} className={`px-3 py-1.5 text-right tabular-nums ${N.cell} ${c.color}`}>
                          {c.parenNative ? `(${fmtN(v, scale)})` : fmtN(v, scale)}
                        </td>
                      );
                    })}

                    {/* Reporting values */}
                    {hasMultiCcy && cols.map((c, ci) => {
                      const v = r.rpt[c.rptKey] as number | null;
                      return (
                        <td key={"rv"+c.label}
                          className={`px-3 py-1.5 text-right tabular-nums ${R.cell} ${ci === 0 ? R.divider : ""} ${c.color}`}>
                          {v === null
                            ? <span className="text-[var(--text-muted)]">—</span>
                            : c.parenRpt ? `(${fmtN(v, scale)})` : fmtN(v, scale)
                          }
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-semibold">
              <td colSpan={3} className={`px-3 py-1.5 ${N.totalHd}`}>
                {hasMultiCcy ? "Total" : `Total${scaleSuffix}`}
              </td>
              {/* Native totals: mixed currencies — suppress */}
              {cols.map((c) => (
                <td key={"nt"+c.label} className={`px-3 py-1.5 text-right ${N.totalHd}`}>
                  {hasMultiCcy ? <span className="opacity-40">—</span> : (
                    <span className={c.color}>
                      {c.parenNative
                        ? `(${fmtN(rows.reduce((s, r) => s + ((r.native as unknown as Record<string,number>)[c.nativeKey]||0), 0), scale)})`
                        : fmtN(rows.reduce((s, r) => s + ((r.native as unknown as Record<string,number>)[c.nativeKey]||0), 0), scale)
                      }
                    </span>
                  )}
                </td>
              ))}
              {/* Reporting totals */}
              {hasMultiCcy && cols.map((c, i) => (
                <td key={"rt"+c.label}
                  className={`px-3 py-1.5 text-right ${R.totalCell} ${i === 0 ? R.divider : ""}`}>
                  {c.parenRpt
                    ? `(${fmtN(rptTotals[c.rptKey] ?? 0, scale)})`
                    : fmtN(rptTotals[c.rptKey] ?? 0, scale)
                  }
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
