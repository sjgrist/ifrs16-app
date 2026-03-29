import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Copy, Check, FileText, AlertTriangle } from "lucide-react";
import { api, type RollForwardRow, type Lease } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";
import { Spinner } from "../components/ui/Spinner";

// ─── Constants ─────────────────────────────────────────────────────────────────
const CCYS = ["GBP","EUR","USD","AUD","CAD","CHF","SEK","NOK","DKK","JPY","SGD","HKD","NZD","CNY","INR","BRL","MXN","ZAR"];
const SCALES = [
  { value: 1,         label: "Units" },
  { value: 1_000,     label: "Thousands" },
  { value: 1_000_000, label: "Millions" },
];

// ─── Pure helpers ──────────────────────────────────────────────────────────────
function addM(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function fmtN(v: number | null, scale: number): string {
  if (v === null) return "—";
  return Math.round(v / scale).toLocaleString("en-GB");
}

function toRpt(amount: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (from === to) return amount;
  const r = rates[from];
  return r != null ? amount * r : null;
}

function yearEnded(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/** Compute undiscounted future lease payments (after `afterDate`) bucketed by maturity. */
function maturityBuckets(lease: Lease, afterDate: string) {
  const freq = lease.payment_frequency === "monthly" ? 1 :
               lease.payment_frequency === "quarterly" ? 3 : 12;
  const totalMonths = lease.term_months +
    (lease.extension_reasonably_certain ? lease.extension_option_months : 0);

  const y1 = addM(afterDate, 12);
  const y5 = addM(afterDate, 60);
  let lt1 = 0, y1to5 = 0, gt5 = 0;

  const startM = lease.payment_timing === "advance" ? 0 : freq;
  const endM   = lease.payment_timing === "advance" ? totalMonths - freq : totalMonths;

  for (let m = startM; m <= endM; m += freq) {
    const payDate = addM(lease.commencement_date, m);
    if (payDate <= afterDate) continue;
    if (payDate <= y1)        lt1   += lease.payment_amount;
    else if (payDate <= y5)   y1to5 += lease.payment_amount;
    else                       gt5   += lease.payment_amount;
  }
  return { lt1, y1to5, gt5 };
}

// ─── Small UI primitives ───────────────────────────────────────────────────────
const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2 text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap border-b border-[var(--border)] ${right ? "text-right" : "text-left"}`}>
    {children}
  </th>
);
const Td = ({ children, right, bold }: { children?: ReactNode; right?: boolean; bold?: boolean }) => (
  <td className={`px-3 py-2 text-xs border-b border-[var(--border)] ${right ? "text-right tabular-nums" : ""} ${bold ? "font-semibold" : ""}`}>
    {children}
  </td>
);
const TotalRow = ({ children }: { children: ReactNode }) => (
  <tr className="border-t-2 border-[var(--border)] bg-slate-50 dark:bg-slate-800/40 font-semibold">
    {children}
  </tr>
);

// ─── Note section wrapper ──────────────────────────────────────────────────────
function NoteSection({ n, title, children, text }: {
  n: string; title: string; children: ReactNode; text: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            {n}
          </span>
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2.5 py-1.5 rounded-md hover:bg-[var(--border)] transition-colors"
        >
          {copied
            ? <Check size={12} className="text-emerald-500" />
            : <Copy size={12} />}
          {copied ? "Copied!" : "Copy section"}
        </button>
      </div>
      <div className="p-5 overflow-x-auto">{children}</div>
    </section>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export function DisclosurePage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const { org } = useAuthStore();

  const [filter, setFilter] = useState({
    entity_id:    "",
    period_start: new Date().getFullYear() + "-01-01",
    period_end:   new Date().getFullYear() + "-12-31",
  });
  const [reportingCcy, setReportingCcy] = useState("GBP");
  const [scale, setScale]               = useState(1_000);
  const [loading, setLoading]           = useState(false);
  const [copiedAll, setCopiedAll]       = useState(false);

  // Raw data after generate
  const [rollForward, setRollForward]   = useState<RollForwardRow[]>([]);
  const [leases, setLeases]             = useState<Lease[]>([]);
  const [fxRates, setFxRates]           = useState<Record<string, number>>({});
  const [missingRates, setMissingRates] = useState<string[]>([]);
  const [generated, setGenerated]       = useState(false);
  const [genFilter, setGenFilter]       = useState(filter);
  const [genCcy, setGenCcy]             = useState("GBP");
  const [genScale, setGenScale]         = useState(1_000);

  useEffect(() => { loadEntities(); }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  const generate = async () => {
    setLoading(true);
    setGenerated(false);
    try {
      const params: Record<string, string> = {
        period_start: filter.period_start,
        period_end:   filter.period_end,
      };
      if (filter.entity_id) params.entity_id = filter.entity_id;

      const [rf, leasesResp, storedFx] = await Promise.all([
        api.schedules.rollforward(params),
        api.leases.list(filter.entity_id ? { entity_id: filter.entity_id } : undefined),
        api.fxRates.list(),
      ]);

      // Build FX rates map: CCY → reporting CCY
      const ratesMap: Record<string, number> = {};
      for (const r of storedFx) {
        if (r.to_ccy === reportingCcy && r.from_ccy !== reportingCcy) {
          ratesMap[r.from_ccy] = Number(r.rate);
        }
      }

      // Check for missing rates
      const allCcys = [...new Set(rf.map((r) => r.currency))].filter((c) => c !== reportingCcy);
      const missing = allCcys.filter((c) => !(c in ratesMap));

      setRollForward(rf);
      setLeases(leasesResp.leases);
      setFxRates(ratesMap);
      setMissingRates(missing);
      setGenFilter({ ...filter });
      setGenCcy(reportingCcy);
      setGenScale(scale);
      setGenerated(true);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Computed disclosure data ────────────────────────────────────────────────
  const scaleLabel    = SCALES.find((s) => s.value === genScale)?.label ?? "Units";
  const scaleSuffix   = scaleLabel === "Units" ? "" : ` (${scaleLabel} ${genCcy})`;
  const periodEndLbl  = yearEnded(genFilter.period_end);
  const orgName       = org?.name ?? "[Company]";

  // ROU asset movement by asset class
  const rouByClass = useMemo(() => {
    const map = new Map<string, { opening: number; additions: number; depreciation: number; closing: number }>();
    for (const r of rollForward) {
      const key = r.assetClass || "Other";
      const cur = map.get(key) ?? { opening: 0, additions: 0, depreciation: 0, closing: 0 };
      map.set(key, {
        opening:     cur.opening     + (toRpt(r.openingRou,      r.currency, genCcy, fxRates) ?? 0),
        additions:   cur.additions   + (toRpt(r.additionsRou,    r.currency, genCcy, fxRates) ?? 0),
        depreciation: cur.depreciation + (toRpt(r.depreciationRou, r.currency, genCcy, fxRates) ?? 0),
        closing:     cur.closing     + (toRpt(r.closingRou,      r.currency, genCcy, fxRates) ?? 0),
      });
    }
    return Array.from(map.entries())
      .map(([cls, v]) => ({ cls, ...v }))
      .sort((a, b) => a.cls.localeCompare(b.cls));
  }, [rollForward, fxRates, genCcy]);

  const rouTotals = useMemo(() =>
    rouByClass.reduce(
      (acc, r) => ({
        opening:     acc.opening     + r.opening,
        additions:   acc.additions   + r.additions,
        depreciation: acc.depreciation + r.depreciation,
        closing:     acc.closing     + r.closing,
      }),
      { opening: 0, additions: 0, depreciation: 0, closing: 0 }
    ), [rouByClass]);

  // Lease liability movement + split
  const liab = useMemo(() => {
    let opening = 0, additions = 0, interest = 0, payments = 0, closing = 0, current = 0, nonCurrent = 0;
    for (const r of rollForward) {
      opening    += toRpt(r.openingLiability,         r.currency, genCcy, fxRates) ?? 0;
      additions  += toRpt(r.additionsLiability,       r.currency, genCcy, fxRates) ?? 0;
      interest   += toRpt(r.interestLiability,        r.currency, genCcy, fxRates) ?? 0;
      payments   += toRpt(r.paymentsLiability,        r.currency, genCcy, fxRates) ?? 0;
      closing    += toRpt(r.closingLiability,         r.currency, genCcy, fxRates) ?? 0;
      current    += toRpt(r.closingCurrentLiability,  r.currency, genCcy, fxRates) ?? 0;
      nonCurrent += toRpt(r.closingNonCurrentLiability, r.currency, genCcy, fxRates) ?? 0;
    }
    return { opening, additions, interest, payments, closing, current, nonCurrent };
  }, [rollForward, fxRates, genCcy]);

  // Maturity analysis — undiscounted future cash flows
  const maturity = useMemo(() => {
    const periodEnd = genFilter.period_end;
    let lt1 = 0, y1to5 = 0, gt5 = 0;
    for (const lease of leases) {
      const rate = lease.currency === genCcy ? 1 : (fxRates[lease.currency] ?? null);
      if (rate === null) continue;
      const b = maturityBuckets(lease, periodEnd);
      lt1   += b.lt1   * rate;
      y1to5 += b.y1to5 * rate;
      gt5   += b.gt5   * rate;
    }
    const totalUndiscounted = lt1 + y1to5 + gt5;
    const discountingEffect = Math.max(0, totalUndiscounted - liab.closing);
    return { lt1, y1to5, gt5, totalUndiscounted, discountingEffect };
  }, [leases, genFilter.period_end, fxRates, genCcy, liab.closing]);

  // P&L charges
  const pl = useMemo(() => {
    let depreciation = 0, interest = 0;
    for (const r of rollForward) {
      depreciation += toRpt(r.depreciationRou,   r.currency, genCcy, fxRates) ?? 0;
      interest     += toRpt(r.interestLiability, r.currency, genCcy, fxRates) ?? 0;
    }
    return { depreciation, interest, total: depreciation + interest };
  }, [rollForward, fxRates, genCcy]);

  // Weighted average IBR by currency (weighted by closing liability)
  const ibr = useMemo(() => {
    const leaseMap = new Map(leases.map((l) => [l.id, l]));
    const byCcy: Record<string, { sum: number; weight: number }> = {};
    let totalWsum = 0, totalW = 0;
    for (const r of rollForward) {
      const lease = leaseMap.get(r.leaseId);
      if (!lease || r.closingLiability <= 0) continue;
      const dr = lease.discount_rate;
      if (!byCcy[r.currency]) byCcy[r.currency] = { sum: 0, weight: 0 };
      byCcy[r.currency].sum    += dr * r.closingLiability;
      byCcy[r.currency].weight += r.closingLiability;
      // For overall, weight in reporting currency
      const liabRpt = toRpt(r.closingLiability, r.currency, genCcy, fxRates) ?? 0;
      totalWsum += dr * liabRpt;
      totalW    += liabRpt;
    }
    const overall = totalW > 0 ? totalWsum / totalW : 0;
    const byCcyArr = Object.entries(byCcy)
      .map(([currency, { sum, weight }]) => ({ currency, rate: weight > 0 ? sum / weight : 0 }))
      .sort((a, b) => a.currency.localeCompare(b.currency));
    return { overall, byCcyArr };
  }, [rollForward, leases, fxRates, genCcy]);

  // ── Plain-text generators (for clipboard) ──────────────────────────────────
  const policyText = [
    `ACCOUNTING POLICIES — LEASES (IFRS 16)`,
    ``,
    `${orgName} recognises a right-of-use (ROU) asset and a corresponding lease liability at the lease commencement date for all leases, except for short-term leases (lease term of 12 months or less) and leases of low-value assets, to which the recognition exemptions are applied.`,
    ``,
    `LEASE LIABILITIES`,
    `Lease liabilities are initially measured at the present value of the lease payments that are not paid at the commencement date, discounted using the lessee's incremental borrowing rate (IBR) where the interest rate implicit in the lease is not readily determinable.`,
    ``,
    `After the commencement date, the carrying amount is increased to reflect the accretion of interest (effective interest method) and reduced to reflect the lease payments made. Lease liabilities are remeasured when there is a lease modification or reassessment.`,
    ``,
    `RIGHT-OF-USE ASSETS`,
    `ROU assets are initially measured at cost, comprising: (i) the initial amount of the lease liability; (ii) any initial direct costs incurred; (iii) lease payments made at or before the commencement date; and (iv) less any lease incentives received.`,
    ``,
    `ROU assets are subsequently depreciated on a straight-line basis from the commencement date to the end of the lease term and are assessed for impairment in accordance with IAS 36.`,
    ``,
    `PRESENTATION`,
    `The lease liability is split between current (payments due within 12 months) and non-current on the balance sheet. Interest on lease liabilities is presented within finance costs; depreciation of ROU assets is presented within operating expenses.`,
  ].join("\n");

  const rouText = [
    `NOTE — RIGHT-OF-USE ASSETS${scaleSuffix}`,
    `Year ended ${periodEndLbl}`,
    ``,
    `Asset class\tOpening\tAdditions\tDepreciation\tClosing`,
    ...rouByClass.map((r) =>
      `${r.cls}\t${fmtN(r.opening, genScale)}\t${fmtN(r.additions, genScale)}\t(${fmtN(r.depreciation, genScale)})\t${fmtN(r.closing, genScale)}`
    ),
    `TOTAL\t${fmtN(rouTotals.opening, genScale)}\t${fmtN(rouTotals.additions, genScale)}\t(${fmtN(rouTotals.depreciation, genScale)})\t${fmtN(rouTotals.closing, genScale)}`,
  ].join("\n");

  const liabText = [
    `NOTE — LEASE LIABILITIES${scaleSuffix}`,
    `Year ended ${periodEndLbl}`,
    ``,
    `MOVEMENT IN LEASE LIABILITY`,
    `Opening balance\t${fmtN(liab.opening, genScale)}`,
    `New leases recognised\t${fmtN(liab.additions, genScale)}`,
    `Interest charge\t${fmtN(liab.interest, genScale)}`,
    `Lease payments\t(${fmtN(liab.payments, genScale)})`,
    `Closing balance\t${fmtN(liab.closing, genScale)}`,
    ``,
    `BALANCE SHEET PRESENTATION`,
    `Current\t${fmtN(liab.current, genScale)}`,
    `Non-current\t${fmtN(liab.nonCurrent, genScale)}`,
    `Total\t${fmtN(liab.closing, genScale)}`,
  ].join("\n");

  const maturityText = [
    `NOTE — MATURITY ANALYSIS OF LEASE LIABILITIES${scaleSuffix}`,
    `Undiscounted contractual cash flows as at ${periodEndLbl}`,
    ``,
    `\tWithin 1 year\t1–5 years\tOver 5 years\tTotal`,
    `Future lease payments\t${fmtN(maturity.lt1, genScale)}\t${fmtN(maturity.y1to5, genScale)}\t${fmtN(maturity.gt5, genScale)}\t${fmtN(maturity.totalUndiscounted, genScale)}`,
    `Less: effect of discounting\t—\t—\t—\t(${fmtN(maturity.discountingEffect, genScale)})`,
    `Total lease liability\t—\t—\t—\t${fmtN(liab.closing, genScale)}`,
  ].join("\n");

  const plText = [
    `NOTE — AMOUNTS RECOGNISED IN PROFIT OR LOSS${scaleSuffix}`,
    `Year ended ${periodEndLbl}`,
    ``,
    `Depreciation of right-of-use assets\t${fmtN(pl.depreciation, genScale)}`,
    `Interest expense on lease liabilities\t${fmtN(pl.interest, genScale)}`,
    `Total charge to profit or loss\t${fmtN(pl.total, genScale)}`,
  ].join("\n");

  const ibrText = [
    `NOTE — WEIGHTED AVERAGE INCREMENTAL BORROWING RATES`,
    `Rates weighted by closing lease liability balance as at ${periodEndLbl}`,
    ``,
    `Currency\tWeighted average IBR`,
    ...ibr.byCcyArr.map((b) => `${b.currency}\t${(b.rate * 100).toFixed(2)}%`),
    ...(ibr.byCcyArr.length > 1 ? [`Overall (liability-weighted)\t${(ibr.overall * 100).toFixed(2)}%`] : []),
  ].join("\n");

  const allText = [policyText, rouText, liabText, maturityText, plText, ibrText]
    .join("\n\n" + "─".repeat(70) + "\n\n");

  const copyAll = async () => {
    await navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto py-8 px-2 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold mb-1">IFRS 16 Note Disclosure</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Generate complete, copy-ready disclosure notes for your annual financial statements.
        </p>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs font-medium text-[var(--text-muted)]">Entity</label>
          <select
            value={filter.entity_id}
            onChange={(e) => setFilter((f) => ({ ...f, entity_id: e.target.value }))}
            className="input text-sm py-1.5"
          >
            <option value="">All entities</option>
            {entities.map((e) => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)]">Period start</label>
          <input
            type="date" className="input text-sm py-1.5"
            value={filter.period_start}
            onChange={(e) => setFilter((f) => ({ ...f, period_start: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)]">Period end</label>
          <input
            type="date" className="input text-sm py-1.5"
            value={filter.period_end}
            onChange={(e) => setFilter((f) => ({ ...f, period_end: e.target.value }))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)]">Reporting CCY</label>
          <select
            value={reportingCcy}
            onChange={(e) => setReportingCcy(e.target.value)}
            className="input text-sm py-1.5"
          >
            {CCYS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--text-muted)]">Scale</label>
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="input text-sm py-1.5"
          >
            {SCALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="btn-primary flex items-center gap-2 self-end"
        >
          {loading ? <Spinner className="w-4 h-4" /> : <FileText size={14} />}
          Generate note
        </button>
      </div>

      {/* ── Missing rate warning ────────────────────────────────────────────── */}
      {generated && missingRates.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            No stored FX rate for{" "}
            <strong>{missingRates.join(", ")} → {genCcy}</strong>. Leases in those currencies
            are excluded from totals. Add rates in{" "}
            <a href="/fx-rates" className="underline">FX Rates</a>.
          </span>
        </div>
      )}

      {/* ── Generated notes ─────────────────────────────────────────────────── */}
      {generated && (
        <>
          {/* Copy-all bar */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">
              Year ended {periodEndLbl} · {genCcy} · {scaleLabel}
            </p>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors"
            >
              {copiedAll ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copiedAll ? "Copied!" : "Copy entire note"}
            </button>
          </div>

          {/* ── Note 1: Accounting policy ─────────────────────────────────── */}
          <NoteSection n="1" title="Accounting policy — leases (IFRS 16)" text={policyText}>
            <div className="space-y-3 text-xs leading-relaxed text-[var(--text)]">
              <p>
                <span className="font-semibold">{orgName}</span> recognises a right-of-use (ROU) asset
                and a corresponding lease liability at the lease commencement date for all leases, except
                for short-term leases (lease term of 12 months or less) and leases of low-value assets,
                to which the recognition exemptions are applied.
              </p>
              <p>
                <span className="font-semibold">Lease liabilities</span> are initially measured at the
                present value of the lease payments that are not paid at commencement, discounted using
                the lessee's incremental borrowing rate (IBR) where the interest rate implicit in the
                lease is not readily determinable. After commencement, the carrying amount is increased
                by the accretion of interest (effective interest method) and reduced by lease payments
                made. Liabilities are remeasured upon lease modification or reassessment.
              </p>
              <p>
                <span className="font-semibold">Right-of-use assets</span> are initially measured at
                cost, comprising: (i) the initial amount of the lease liability; (ii) any initial direct
                costs incurred; (iii) lease payments made at or before commencement; and (iv) less any
                lease incentives received. ROU assets are subsequently depreciated on a straight-line
                basis over the lease term and assessed for impairment under IAS 36.
              </p>
              <p>
                <span className="font-semibold">Presentation.</span> The lease liability is presented as
                current (within 12 months) and non-current on the balance sheet. Interest on lease
                liabilities is presented within finance costs; depreciation of ROU assets is presented
                within operating expenses.
              </p>
            </div>
          </NoteSection>

          {/* ── Note 2: ROU asset ─────────────────────────────────────────── */}
          <NoteSection n="2" title={`Right-of-use assets${scaleSuffix}`} text={rouText}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <Th>Asset class</Th>
                  <Th right>Opening</Th>
                  <Th right>Additions</Th>
                  <Th right>Depreciation</Th>
                  <Th right>Closing</Th>
                </tr>
              </thead>
              <tbody>
                {rouByClass.map((r) => (
                  <tr key={r.cls}>
                    <Td>{r.cls}</Td>
                    <Td right>{fmtN(r.opening, genScale)}</Td>
                    <Td right>{fmtN(r.additions, genScale)}</Td>
                    <Td right>({fmtN(r.depreciation, genScale)})</Td>
                    <Td right>{fmtN(r.closing, genScale)}</Td>
                  </tr>
                ))}
                <TotalRow>
                  <Td bold>Total</Td>
                  <Td right bold>{fmtN(rouTotals.opening, genScale)}</Td>
                  <Td right bold>{fmtN(rouTotals.additions, genScale)}</Td>
                  <Td right bold>({fmtN(rouTotals.depreciation, genScale)})</Td>
                  <Td right bold>{fmtN(rouTotals.closing, genScale)}</Td>
                </TotalRow>
              </tbody>
            </table>
          </NoteSection>

          {/* ── Note 3: Lease liability ───────────────────────────────────── */}
          <NoteSection n="3" title={`Lease liabilities${scaleSuffix}`} text={liabText}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Movement */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Movement in lease liability
                </p>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {[
                      { label: "Opening balance",         v: liab.opening,   neg: false },
                      { label: "New leases recognised",   v: liab.additions, neg: false },
                      { label: "Interest charge",         v: liab.interest,  neg: false },
                      { label: "Lease payments",          v: liab.payments,  neg: true  },
                    ].map(({ label, v, neg }) => (
                      <tr key={label}>
                        <Td>{label}</Td>
                        <Td right>{neg ? `(${fmtN(v, genScale)})` : fmtN(v, genScale)}</Td>
                      </tr>
                    ))}
                    <TotalRow>
                      <Td bold>Closing balance</Td>
                      <Td right bold>{fmtN(liab.closing, genScale)}</Td>
                    </TotalRow>
                  </tbody>
                </table>
              </div>
              {/* Balance sheet split */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  Balance sheet presentation
                </p>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr>
                      <Td>Current</Td>
                      <Td right>{fmtN(liab.current, genScale)}</Td>
                    </tr>
                    <tr>
                      <Td>Non-current</Td>
                      <Td right>{fmtN(liab.nonCurrent, genScale)}</Td>
                    </tr>
                    <TotalRow>
                      <Td bold>Total lease liability</Td>
                      <Td right bold>{fmtN(liab.closing, genScale)}</Td>
                    </TotalRow>
                  </tbody>
                </table>
              </div>
            </div>
          </NoteSection>

          {/* ── Note 4: Maturity analysis ─────────────────────────────────── */}
          <NoteSection n="4" title={`Maturity analysis${scaleSuffix}`} text={maturityText}>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Undiscounted contractual cash flows as at {periodEndLbl}:
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <Th></Th>
                  <Th right>Within 1 year</Th>
                  <Th right>1–5 years</Th>
                  <Th right>Over 5 years</Th>
                  <Th right>Total</Th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <Td>Future lease payments</Td>
                  <Td right>{fmtN(maturity.lt1, genScale)}</Td>
                  <Td right>{fmtN(maturity.y1to5, genScale)}</Td>
                  <Td right>{fmtN(maturity.gt5, genScale)}</Td>
                  <Td right>{fmtN(maturity.totalUndiscounted, genScale)}</Td>
                </tr>
                <tr>
                  <Td>Less: effect of discounting</Td>
                  <Td right>—</Td>
                  <Td right>—</Td>
                  <Td right>—</Td>
                  <Td right>({fmtN(maturity.discountingEffect, genScale)})</Td>
                </tr>
                <TotalRow>
                  <Td bold>Total lease liability</Td>
                  <Td right bold>—</Td>
                  <Td right bold>—</Td>
                  <Td right bold>—</Td>
                  <Td right bold>{fmtN(liab.closing, genScale)}</Td>
                </TotalRow>
              </tbody>
            </table>
          </NoteSection>

          {/* ── Note 5: P&L charges ──────────────────────────────────────── */}
          <NoteSection n="5" title={`Amounts recognised in profit or loss${scaleSuffix}`} text={plText}>
            <table className="w-full text-xs border-collapse max-w-sm">
              <tbody>
                <tr>
                  <Td>Depreciation of right-of-use assets</Td>
                  <Td right>{fmtN(pl.depreciation, genScale)}</Td>
                </tr>
                <tr>
                  <Td>Interest expense on lease liabilities</Td>
                  <Td right>{fmtN(pl.interest, genScale)}</Td>
                </tr>
                <TotalRow>
                  <Td bold>Total charge to profit or loss</Td>
                  <Td right bold>{fmtN(pl.total, genScale)}</Td>
                </TotalRow>
              </tbody>
            </table>
          </NoteSection>

          {/* ── Note 6: Weighted average IBR ─────────────────────────────── */}
          <NoteSection n="6" title="Weighted average incremental borrowing rates" text={ibrText}>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Rates are weighted by closing lease liability balance as at {periodEndLbl}.
            </p>
            <table className="w-full text-xs border-collapse max-w-xs">
              <thead>
                <tr>
                  <Th>Currency</Th>
                  <Th right>Weighted average IBR</Th>
                </tr>
              </thead>
              <tbody>
                {ibr.byCcyArr.map((b) => (
                  <tr key={b.currency}>
                    <Td>{b.currency}</Td>
                    <Td right>{(b.rate * 100).toFixed(2)}%</Td>
                  </tr>
                ))}
                {ibr.byCcyArr.length > 1 && (
                  <TotalRow>
                    <Td bold>Overall (liability-weighted)</Td>
                    <Td right bold>{(ibr.overall * 100).toFixed(2)}%</Td>
                  </TotalRow>
                )}
              </tbody>
            </table>
          </NoteSection>
        </>
      )}
    </div>
  );
}
