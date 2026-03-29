import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Copy, Check, FileText, AlertTriangle } from "lucide-react";
import { api, type RollForwardRow, type Lease } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useAuthStore } from "../lib/authStore";
import { useToast } from "../components/ui/Toast";
import { Spinner } from "../components/ui/Spinner";
import { EntityMultiSelect } from "../components/ui/EntityMultiSelect";

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
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Undiscounted future payments bucketed into 6 annual bands (IFRS 16.58 / EY Good Group format).
 */
function maturityBands(lease: Lease, afterDate: string) {
  const freq = lease.payment_frequency === "monthly" ? 1 : lease.payment_frequency === "quarterly" ? 3 : 12;
  const totalMonths = lease.term_months + (lease.extension_reasonably_certain ? lease.extension_option_months : 0);
  const [y1,y2,y3,y4,y5] = [12,24,36,48,60].map((n) => addM(afterDate, n));
  let yr1=0, yr2=0, yr3=0, yr4=0, yr5=0, gt5=0;
  const startM = lease.payment_timing === "advance" ? 0 : freq;
  const endM   = lease.payment_timing === "advance" ? totalMonths - freq : totalMonths;
  for (let m = startM; m <= endM; m += freq) {
    const pd = addM(lease.commencement_date, m);
    if (pd <= afterDate) continue;
    const a = lease.payment_amount;
    if      (pd <= y1) yr1 += a;
    else if (pd <= y2) yr2 += a;
    else if (pd <= y3) yr3 += a;
    else if (pd <= y4) yr4 += a;
    else if (pd <= y5) yr5 += a;
    else                gt5 += a;
  }
  return { yr1, yr2, yr3, yr4, yr5, gt5 };
}

// ─── UI primitives ─────────────────────────────────────────────────────────────
const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`px-3 py-2 text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap border-b border-[var(--border)] ${right ? "text-right" : "text-left"}`}>{children}</th>
);
const Td = ({ children, right, bold, muted }: { children?: ReactNode; right?: boolean; bold?: boolean; muted?: boolean }) => (
  <td className={`px-3 py-2 text-xs border-b border-[var(--border)] ${right ? "text-right tabular-nums" : ""} ${bold ? "font-semibold" : ""} ${muted ? "text-[var(--text-muted)]" : ""}`}>{children}</td>
);
const TR = ({ children }: { children: ReactNode }) => (
  <tr className="border-t-2 border-[var(--border)] bg-slate-50 dark:bg-slate-800/40 font-semibold">{children}</tr>
);

function NoteSection({ n, title, children, text }: { n: string; title: string; children: ReactNode; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{n}</span>
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <button
          onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),2200); }}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] px-2.5 py-1.5 rounded-md hover:bg-[var(--border)] transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
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

  const [entityIds, setEntityIds]       = useState<number[]>([]);
  const [filter, setFilter]             = useState({
    period_start: new Date().getFullYear() + "-01-01",
    period_end:   new Date().getFullYear() + "-12-31",
  });
  const [reportingCcy, setReportingCcy] = useState("GBP");
  const [scale, setScale]               = useState(1_000);
  const [loading, setLoading]           = useState(false);
  const [copiedAll, setCopiedAll]       = useState(false);

  const [rollForward, setRollForward]   = useState<RollForwardRow[]>([]);
  const [leases, setLeases]             = useState<Lease[]>([]);
  const [fxRates, setFxRates]           = useState<Record<string, number>>({});
  const [missingRates, setMissingRates] = useState<string[]>([]);
  const [generated, setGenerated]       = useState(false);
  const [genFilter, setGenFilter]       = useState(filter);
  const [genCcy, setGenCcy]             = useState("GBP");
  const [genScale, setGenScale]         = useState(1_000);

  useEffect(() => { loadEntities(); }, []);

  const generate = async () => {
    setLoading(true); setGenerated(false);
    try {
      const params: Record<string, string> = { period_start: filter.period_start, period_end: filter.period_end };
      if (entityIds.length) params.entity_ids = entityIds.join(",");
      const lp: Record<string,string> = {};
      if (entityIds.length) lp.entity_ids = entityIds.join(",");

      const [rf, leasesResp, storedFx] = await Promise.all([
        api.schedules.rollforward(params),
        api.leases.list(Object.keys(lp).length ? lp : undefined),
        api.fxRates.list(),
      ]);

      const ratesMap: Record<string, number> = {};
      for (const r of storedFx)
        if (r.to_ccy === reportingCcy && r.from_ccy !== reportingCcy)
          ratesMap[r.from_ccy] = Number(r.rate);

      const allCcys = [...new Set(rf.map((r) => r.currency))].filter((c) => c !== reportingCcy);
      setMissingRates(allCcys.filter((c) => !(c in ratesMap)));
      setRollForward(rf); setLeases(leasesResp.leases); setFxRates(ratesMap);
      setGenFilter({...filter}); setGenCcy(reportingCcy); setGenScale(scale);
      setGenerated(true);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };

  // ── Computed data ──────────────────────────────────────────────────────────
  const scaleLabel  = SCALES.find((s) => s.value === genScale)?.label ?? "Units";
  const scaleSuffix = scaleLabel === "Units" ? "" : ` (${scaleLabel} ${genCcy})`;
  const peLbl       = yearEnded(genFilter.period_end);
  const orgName     = org?.name ?? "[Company]";

  // Note 2 — ROU by asset class
  const rouByClass = useMemo(() => {
    const map = new Map<string,{opening:number;additions:number;depreciation:number;closing:number}>();
    for (const r of rollForward) {
      const k = r.assetClass || "Other";
      const c = map.get(k) ?? {opening:0,additions:0,depreciation:0,closing:0};
      map.set(k, {
        opening:      c.opening      + (toRpt(r.openingRou,      r.currency,genCcy,fxRates)??0),
        additions:    c.additions    + (toRpt(r.additionsRou,    r.currency,genCcy,fxRates)??0),
        depreciation: c.depreciation + (toRpt(r.depreciationRou, r.currency,genCcy,fxRates)??0),
        closing:      c.closing      + (toRpt(r.closingRou,      r.currency,genCcy,fxRates)??0),
      });
    }
    return [...map.entries()].map(([cls,v])=>({cls,...v})).sort((a,b)=>a.cls.localeCompare(b.cls));
  }, [rollForward,fxRates,genCcy]);

  const rouTot = useMemo(()=>rouByClass.reduce((a,r)=>({opening:a.opening+r.opening,additions:a.additions+r.additions,depreciation:a.depreciation+r.depreciation,closing:a.closing+r.closing}),{opening:0,additions:0,depreciation:0,closing:0}),[rouByClass]);

  // Note 3 — Lease liability
  const liab = useMemo(()=>{
    let opening=0,additions=0,interest=0,payments=0,closing=0,current=0,nonCurrent=0;
    for (const r of rollForward){
      opening    +=(toRpt(r.openingLiability,          r.currency,genCcy,fxRates)??0);
      additions  +=(toRpt(r.additionsLiability,        r.currency,genCcy,fxRates)??0);
      interest   +=(toRpt(r.interestLiability,         r.currency,genCcy,fxRates)??0);
      payments   +=(toRpt(r.paymentsLiability,         r.currency,genCcy,fxRates)??0);
      closing    +=(toRpt(r.closingLiability,          r.currency,genCcy,fxRates)??0);
      current    +=(toRpt(r.closingCurrentLiability,   r.currency,genCcy,fxRates)??0);
      nonCurrent +=(toRpt(r.closingNonCurrentLiability,r.currency,genCcy,fxRates)??0);
    }
    return {opening,additions,interest,payments,closing,current,nonCurrent};
  },[rollForward,fxRates,genCcy]);

  // Note 4 — Maturity (6 annual bands)
  const mat = useMemo(()=>{
    let yr1=0,yr2=0,yr3=0,yr4=0,yr5=0,gt5=0;
    for (const l of leases){
      const rate=l.currency===genCcy?1:(fxRates[l.currency]??null);
      if(rate===null) continue;
      const b=maturityBands(l,genFilter.period_end);
      yr1+=b.yr1*rate; yr2+=b.yr2*rate; yr3+=b.yr3*rate;
      yr4+=b.yr4*rate; yr5+=b.yr5*rate; gt5+=b.gt5*rate;
    }
    const total=yr1+yr2+yr3+yr4+yr5+gt5;
    return {yr1,yr2,yr3,yr4,yr5,gt5,total,disc:Math.max(0,total-liab.closing)};
  },[leases,genFilter.period_end,fxRates,genCcy,liab.closing]);

  // Note 5 — P&L
  const pl = useMemo(()=>{
    let dep=0,int=0;
    for (const r of rollForward){
      dep+=(toRpt(r.depreciationRou,  r.currency,genCcy,fxRates)??0);
      int+=(toRpt(r.interestLiability,r.currency,genCcy,fxRates)??0);
    }
    return {dep,int,total:dep+int};
  },[rollForward,fxRates,genCcy]);

  // Note 6 — Cash outflow (IFRS 16.53(g))
  const cashOut = useMemo(()=>rollForward.reduce((s,r)=>s+(toRpt(r.paymentsLiability,r.currency,genCcy,fxRates)??0),0),[rollForward,fxRates,genCcy]);
  const intPaid = useMemo(()=>rollForward.reduce((s,r)=>s+(toRpt(r.interestLiability,r.currency,genCcy,fxRates)??0),0),[rollForward,fxRates,genCcy]);

  // Note 7 — Weighted avg IBR + remaining term
  const ibrTerm = useMemo(()=>{
    const lm=new Map(leases.map(l=>[l.id,l]));
    const byCcy:Record<string,{ibrW:number;termW:number;w:number}>={};;
    let iW=0,tW=0,W=0;
    const peMs=new Date(genFilter.period_end+"T00:00:00Z").getTime();
    for (const r of rollForward){
      const l=lm.get(r.leaseId); if(!l||r.closingLiability<=0) continue;
      const tm=l.term_months+(l.extension_reasonably_certain?l.extension_option_months:0);
      const rem=Math.max(0,(new Date(addM(l.commencement_date,tm)+"T00:00:00Z").getTime()-peMs)/(30.44*86400*1000));
      const w=r.closingLiability;
      if(!byCcy[r.currency]) byCcy[r.currency]={ibrW:0,termW:0,w:0};
      byCcy[r.currency].ibrW +=l.discount_rate*w;
      byCcy[r.currency].termW+=rem*w;
      byCcy[r.currency].w    +=w;
      const wr=toRpt(w,r.currency,genCcy,fxRates)??0;
      iW+=l.discount_rate*wr; tW+=rem*wr; W+=wr;
    }
    const arr=Object.entries(byCcy).map(([currency,d])=>({currency,ibr:d.w>0?d.ibrW/d.w:0,term:d.w>0?d.termW/d.w:0})).sort((a,b)=>a.currency.localeCompare(b.currency));
    return {overallIbr:W>0?iW/W:0,overallTerm:W>0?tW/W:0,arr};
  },[rollForward,leases,fxRates,genCcy,genFilter.period_end]);

  // ── Plain text for clipboard ───────────────────────────────────────────────
  const yr=parseInt(genFilter.period_end.slice(0,4),10);

  const t1=[
    `ACCOUNTING POLICIES — LEASES (IFRS 16)`,``,
    `${orgName} recognises a right-of-use (ROU) asset and a corresponding lease liability at the lease commencement date for all leases, except for short-term leases (≤12 months) and leases of low-value assets.`,``,
    `LEASE LIABILITIES: Initially measured at the present value of future lease payments, discounted at the rate implicit in the lease or the lessee's incremental borrowing rate (IBR). Subsequent measurement increases the carrying amount for interest (effective interest method) and reduces it for payments made.`,``,
    `RIGHT-OF-USE ASSETS: Initially measured at cost (lease liability + initial direct costs + prepaid payments − incentives). Subsequently depreciated straight-line over the lease term and assessed for impairment under IAS 36.`,``,
    `LEASE TERM: Non-cancellable period plus extension options that ${orgName} is reasonably certain to exercise, reassessed upon significant events.`,``,
    `PRESENTATION: Current/non-current split on balance sheet. Interest within finance costs; depreciation within operating expenses. Principal repayments → financing activities; interest paid → [financing/operating] activities.`,
  ].join("\n");

  const t2=[`NOTE — RIGHT-OF-USE ASSETS${scaleSuffix}`,`Year ended ${peLbl}`,``,
    `Asset class\tOpening\tAdditions\tDepreciation\tClosing`,
    ...rouByClass.map(r=>`${r.cls}\t${fmtN(r.opening,genScale)}\t${fmtN(r.additions,genScale)}\t(${fmtN(r.depreciation,genScale)})\t${fmtN(r.closing,genScale)}`),
    `TOTAL\t${fmtN(rouTot.opening,genScale)}\t${fmtN(rouTot.additions,genScale)}\t(${fmtN(rouTot.depreciation,genScale)})\t${fmtN(rouTot.closing,genScale)}`,
  ].join("\n");

  const t3=[`NOTE — LEASE LIABILITIES${scaleSuffix}`,`Year ended ${peLbl}`,``,
    `Opening balance\t${fmtN(liab.opening,genScale)}`,
    `New leases recognised\t${fmtN(liab.additions,genScale)}`,
    `Interest charge\t${fmtN(liab.interest,genScale)}`,
    `Lease payments\t(${fmtN(liab.payments,genScale)})`,
    `Closing balance\t${fmtN(liab.closing,genScale)}`,``,
    `Current\t${fmtN(liab.current,genScale)}`,
    `Non-current\t${fmtN(liab.nonCurrent,genScale)}`,
    `Total\t${fmtN(liab.closing,genScale)}`,
  ].join("\n");

  const t4=[`NOTE — MATURITY ANALYSIS${scaleSuffix}`,`Undiscounted cash flows as at ${peLbl}`,``,
    `\tYear 1 (${yr})\tYear 2 (${yr+1})\tYear 3 (${yr+2})\tYear 4 (${yr+3})\tYear 5 (${yr+4})\tOver 5 years\tTotal`,
    `Future lease payments\t${fmtN(mat.yr1,genScale)}\t${fmtN(mat.yr2,genScale)}\t${fmtN(mat.yr3,genScale)}\t${fmtN(mat.yr4,genScale)}\t${fmtN(mat.yr5,genScale)}\t${fmtN(mat.gt5,genScale)}\t${fmtN(mat.total,genScale)}`,
    `Less: effect of discounting\t\t\t\t\t\t\t(${fmtN(mat.disc,genScale)})`,
    `Total lease liability\t\t\t\t\t\t\t${fmtN(liab.closing,genScale)}`,
  ].join("\n");

  const t5=[`NOTE — P&L CHARGES${scaleSuffix}`,`Year ended ${peLbl}`,``,
    `Depreciation of right-of-use assets\t${fmtN(pl.dep,genScale)}`,
    `Interest expense on lease liabilities\t${fmtN(pl.int,genScale)}`,
    `Total charge to profit or loss\t${fmtN(pl.total,genScale)}`,
  ].join("\n");

  const t6=[`NOTE — TOTAL CASH OUTFLOW FOR LEASES — IFRS 16.53(g)${scaleSuffix}`,`Year ended ${peLbl}`,``,
    `Principal repayments\t${fmtN(cashOut-intPaid,genScale)}`,
    `Interest paid\t${fmtN(intPaid,genScale)}`,
    `Total cash outflow for leases\t${fmtN(cashOut,genScale)}`,
  ].join("\n");

  const t7=[`NOTE — WEIGHTED AVERAGE IBR AND REMAINING LEASE TERM`,`As at ${peLbl}`,``,
    `Currency\tWeighted avg IBR\tWeighted avg remaining term`,
    ...ibrTerm.arr.map(b=>`${b.currency}\t${(b.ibr*100).toFixed(2)}%\t${b.term.toFixed(1)} months`),
    ...(ibrTerm.arr.length>1?[`Overall\t${(ibrTerm.overallIbr*100).toFixed(2)}%\t${ibrTerm.overallTerm.toFixed(1)} months`]:[]),
  ].join("\n");

  const t8=[`NOTE — QUALITATIVE DISCLOSURES (IFRS 16.59 / B48–B52) — TEMPLATE`,``,
    `NATURE OF LEASING ACTIVITIES\n${orgName} leases [describe assets]. Property leases: [X–Y years]. Vehicle/equipment leases: [X–Y years]. [Variable payments: not material / linked to index.]`,``,
    `EXTENSION OPTIONS\n[Extension options held on [asset classes]. Not included in liability = potential CU [X,XXX] undiscounted. Assessment based on [factors].]`,``,
    `RESIDUAL VALUE GUARANTEES\n[Guarantees: CU [X] / None in place.]`,``,
    `LEASES NOT YET COMMENCED\n[Committed leases not yet commenced: [X] leases, CU [X,XXX] undiscounted / None.]`,``,
    `RESTRICTIONS AND COVENANTS\n[Subletting restrictions, maintenance obligations. Financial covenants: [describe / none].]`,``,
    `CASH FLOW CLASSIFICATION\nPrincipal repayments → financing activities. Interest paid → [financing/operating] activities.`,
  ].join("\n");

  const allText=[t1,t2,t3,t4,t5,t6,t7,t8].join("\n\n"+"─".repeat(70)+"\n\n");

  return (
    <div className="max-w-5xl mx-auto py-8 px-2 space-y-6">

      <div>
        <h1 className="text-xl font-bold mb-1">IFRS 16 Note Disclosure</h1>
        <p className="text-sm text-[var(--text-muted)]">
          8 copy-ready notes aligned with IFRS 16.53–59 and EY Good Group illustrative format.
        </p>
      </div>

      {/* Filter bar */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="label">Entity</label>
          <EntityMultiSelect entities={entities} value={entityIds} onChange={setEntityIds} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Period start</label>
          <input type="date" className="input text-sm py-1.5" value={filter.period_start}
            onChange={(e)=>setFilter(f=>({...f,period_start:e.target.value}))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Period end</label>
          <input type="date" className="input text-sm py-1.5" value={filter.period_end}
            onChange={(e)=>setFilter(f=>({...f,period_end:e.target.value}))} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Reporting CCY</label>
          <select value={reportingCcy} onChange={(e)=>setReportingCcy(e.target.value)} className="input text-sm py-1.5">
            {CCYS.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Scale</label>
          <select value={scale} onChange={(e)=>setScale(Number(e.target.value))} className="input text-sm py-1.5">
            {SCALES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button onClick={generate} disabled={loading} className="btn-primary flex items-center gap-2 self-end">
          {loading?<Spinner className="w-4 h-4"/>:<FileText size={14}/>} Generate note
        </button>
      </div>

      {generated && missingRates.length>0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5"/>
          <span>No stored FX rate for <strong>{missingRates.join(", ")} → {genCcy}</strong>. Leases in those currencies excluded. <a href="/fx-rates" className="underline">Add FX rates</a>.</span>
        </div>
      )}

      {generated && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">Year ended {peLbl} · {genCcy} · {scaleLabel}</p>
            <button onClick={async()=>{await navigator.clipboard.writeText(allText);setCopiedAll(true);setTimeout(()=>setCopiedAll(false),2500);}}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-600 transition-colors">
              {copiedAll?<Check size={14} className="text-emerald-500"/>:<Copy size={14}/>}
              {copiedAll?"Copied!":"Copy entire note"}
            </button>
          </div>

          {/* Note 1 — Accounting policy */}
          <NoteSection n="1" title="Accounting policy — leases (IFRS 16)" text={t1}>
            <div className="space-y-3 text-xs leading-relaxed">
              <p><span className="font-semibold">{orgName}</span> recognises a right-of-use (ROU) asset and a corresponding lease liability at the lease commencement date for all leases, except for short-term leases (≤12 months) and leases of low-value assets.</p>
              <p><span className="font-semibold">Lease liabilities</span> are initially measured at the present value of future lease payments discounted at the implicit rate or, if undeterminable, the lessee's incremental borrowing rate (IBR). The carrying amount is subsequently increased for interest (effective interest method) and reduced for payments made. Remeasurement is triggered by modification, change in lease term, or reassessment of options.</p>
              <p><span className="font-semibold">Right-of-use assets</span> are initially measured at cost (lease liability + initial direct costs + prepaid payments − lease incentives received) and subsequently depreciated straight-line over the lease term. ROU assets are tested for impairment under IAS 36.</p>
              <p><span className="font-semibold">Lease term</span> is the non-cancellable period plus any extension option that {orgName} is reasonably certain to exercise, reassessed upon significant events or change in circumstances.</p>
              <p><span className="font-semibold">Presentation.</span> Lease liabilities are split between current (≤12 months) and non-current on the balance sheet. Interest is presented within finance costs; depreciation within operating expenses. Principal repayments are classified as financing activities; interest paid as [financing/operating] activities in the cash flow statement.</p>
            </div>
          </NoteSection>

          {/* Note 2 — ROU assets */}
          <NoteSection n="2" title={`Right-of-use assets${scaleSuffix}`} text={t2}>
            <table className="w-full text-xs border-collapse">
              <thead><tr><Th>Asset class</Th><Th right>Opening</Th><Th right>Additions</Th><Th right>Depreciation</Th><Th right>Closing</Th></tr></thead>
              <tbody>
                {rouByClass.map(r=>(
                  <tr key={r.cls}>
                    <Td>{r.cls}</Td>
                    <Td right>{fmtN(r.opening,genScale)}</Td>
                    <Td right>{fmtN(r.additions,genScale)}</Td>
                    <Td right>({fmtN(r.depreciation,genScale)})</Td>
                    <Td right>{fmtN(r.closing,genScale)}</Td>
                  </tr>
                ))}
                <TR><Td bold>Total</Td><Td right bold>{fmtN(rouTot.opening,genScale)}</Td><Td right bold>{fmtN(rouTot.additions,genScale)}</Td><Td right bold>({fmtN(rouTot.depreciation,genScale)})</Td><Td right bold>{fmtN(rouTot.closing,genScale)}</Td></TR>
              </tbody>
            </table>
          </NoteSection>

          {/* Note 3 — Lease liabilities */}
          <NoteSection n="3" title={`Lease liabilities${scaleSuffix}`} text={t3}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Movement</p>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr><Td>Opening balance</Td><Td right>{fmtN(liab.opening,genScale)}</Td></tr>
                    <tr><Td>New leases recognised</Td><Td right>{fmtN(liab.additions,genScale)}</Td></tr>
                    <tr><Td>Interest charge</Td><Td right>{fmtN(liab.interest,genScale)}</Td></tr>
                    <tr><Td>Lease payments</Td><Td right>({fmtN(liab.payments,genScale)})</Td></tr>
                    <TR><Td bold>Closing balance</Td><Td right bold>{fmtN(liab.closing,genScale)}</Td></TR>
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Balance sheet presentation</p>
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    <tr><Td>Current</Td><Td right>{fmtN(liab.current,genScale)}</Td></tr>
                    <tr><Td>Non-current</Td><Td right>{fmtN(liab.nonCurrent,genScale)}</Td></tr>
                    <TR><Td bold>Total lease liability</Td><Td right bold>{fmtN(liab.closing,genScale)}</Td></TR>
                  </tbody>
                </table>
              </div>
            </div>
          </NoteSection>

          {/* Note 4 — Maturity (6 annual bands — IFRS 16.58 / EY Good Group) */}
          <NoteSection n="4" title={`Maturity analysis — undiscounted cash flows${scaleSuffix}`} text={t4}>
            <p className="text-xs text-[var(--text-muted)] mb-3">Undiscounted contractual cash flows as at {peLbl}:</p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse min-w-full">
                <thead>
                  <tr>
                    <Th></Th>
                    <Th right>Year 1<br/><span className="font-normal opacity-70">{yr}</span></Th>
                    <Th right>Year 2<br/><span className="font-normal opacity-70">{yr+1}</span></Th>
                    <Th right>Year 3<br/><span className="font-normal opacity-70">{yr+2}</span></Th>
                    <Th right>Year 4<br/><span className="font-normal opacity-70">{yr+3}</span></Th>
                    <Th right>Year 5<br/><span className="font-normal opacity-70">{yr+4}</span></Th>
                    <Th right>Over 5 years</Th>
                    <Th right>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td>Future lease payments</Td>
                    <Td right>{fmtN(mat.yr1,genScale)}</Td><Td right>{fmtN(mat.yr2,genScale)}</Td>
                    <Td right>{fmtN(mat.yr3,genScale)}</Td><Td right>{fmtN(mat.yr4,genScale)}</Td>
                    <Td right>{fmtN(mat.yr5,genScale)}</Td><Td right>{fmtN(mat.gt5,genScale)}</Td>
                    <Td right>{fmtN(mat.total,genScale)}</Td>
                  </tr>
                  <tr>
                    <Td>Less: effect of discounting</Td>
                    {[0,0,0,0,0,0].map((_,i)=><Td key={i} right muted>—</Td>)}
                    <Td right>({fmtN(mat.disc,genScale)})</Td>
                  </tr>
                  <TR>
                    <Td bold>Total lease liability</Td>
                    {[0,0,0,0,0,0].map((_,i)=><Td key={i} right bold muted>—</Td>)}
                    <Td right bold>{fmtN(liab.closing,genScale)}</Td>
                  </TR>
                </tbody>
              </table>
            </div>
          </NoteSection>

          {/* Note 5 — P&L */}
          <NoteSection n="5" title={`Amounts recognised in profit or loss${scaleSuffix}`} text={t5}>
            <table className="w-full text-xs border-collapse max-w-sm">
              <tbody>
                <tr><Td>Depreciation of right-of-use assets</Td><Td right>{fmtN(pl.dep,genScale)}</Td></tr>
                <tr><Td>Interest expense on lease liabilities</Td><Td right>{fmtN(pl.int,genScale)}</Td></tr>
                <TR><Td bold>Total charge to profit or loss</Td><Td right bold>{fmtN(pl.total,genScale)}</Td></TR>
              </tbody>
            </table>
          </NoteSection>

          {/* Note 6 — Total cash outflow (IFRS 16.53(g)) */}
          <NoteSection n="6" title={`Total cash outflow for leases — IFRS 16.53(g)${scaleSuffix}`} text={t6}>
            <table className="w-full text-xs border-collapse max-w-sm">
              <tbody>
                <tr><Td>Principal repayments on lease liabilities</Td><Td right>{fmtN(cashOut-intPaid,genScale)}</Td></tr>
                <tr><Td>Interest paid on lease liabilities</Td><Td right>{fmtN(intPaid,genScale)}</Td></tr>
                <TR><Td bold>Total cash outflow for leases</Td><Td right bold>{fmtN(cashOut,genScale)}</Td></TR>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Principal repayments are presented in financing activities; interest paid in [financing/operating] activities in the statement of cash flows.
            </p>
          </NoteSection>

          {/* Note 7 — IBR + remaining term */}
          <NoteSection n="7" title="Weighted average IBR and remaining lease term" text={t7}>
            <p className="text-xs text-[var(--text-muted)] mb-3">Weighted by closing lease liability balance as at {peLbl}:</p>
            <table className="w-full text-xs border-collapse max-w-md">
              <thead><tr><Th>Currency</Th><Th right>Weighted avg IBR</Th><Th right>Weighted avg remaining term</Th></tr></thead>
              <tbody>
                {ibrTerm.arr.map(b=>(
                  <tr key={b.currency}>
                    <Td>{b.currency}</Td>
                    <Td right>{(b.ibr*100).toFixed(2)}%</Td>
                    <Td right>{b.term.toFixed(1)} months</Td>
                  </tr>
                ))}
                {ibrTerm.arr.length>1&&(
                  <TR><Td bold>Overall</Td><Td right bold>{(ibrTerm.overallIbr*100).toFixed(2)}%</Td><Td right bold>{ibrTerm.overallTerm.toFixed(1)} months</Td></TR>
                )}
              </tbody>
            </table>
          </NoteSection>

          {/* Note 8 — Qualitative disclosures (B48–B52) */}
          <NoteSection n="8" title="Qualitative disclosures (IFRS 16.59 / B48–B52) — template" text={t8}>
            <p className="text-xs text-[var(--text-muted)] mb-4">Complete the items in brackets before including in financial statements.</p>
            <div className="space-y-4 text-xs leading-relaxed">
              {[
                { h:"Nature of leasing activities", b:`${orgName} leases [describe: e.g. office premises, warehouses, motor vehicles and plant and machinery]. Property leases typically run for [X–Y years] with options to extend. Vehicle and equipment leases are typically [X–Y years] with no extension options. [Variable lease payments are not material / are linked to [CPI/RPI/index].]` },
                { h:"Extension and termination options", b:`[${orgName} holds extension options on [describe asset classes] leases to maximise operational flexibility. As at ${peLbl}, options not reflected in the lease liability represent potential undiscounted cash flows of approximately [${genCcy} X,XXX]. The assessment of reasonable certainty is based on [describe: strategic importance, relocation costs, alternative availability].]` },
                { h:"Residual value guarantees", b:`[${orgName} has provided residual value guarantees of [${genCcy} X] in respect of [describe leases]. Amounts expected payable total [${genCcy} X]. / No residual value guarantees are in place.]` },
                { h:"Leases not yet commenced", b:`[As at ${peLbl}, ${orgName} has committed to [X] leases not yet commenced with total undiscounted future payments of approximately [${genCcy} X,XXX]. These are not yet recognised on the balance sheet. / No leases have been signed but not yet commenced.]` },
                { h:"Restrictions and covenants", b:`[Certain agreements contain subletting restrictions and maintenance obligations. [No material financial covenants are attached to lease liabilities / The following covenants apply: describe.]]` },
                { h:"Cash flow classification", b:`Principal repayments on lease liabilities are classified as financing activities. Interest paid on lease liabilities is classified as [financing / operating] activities.` },
              ].map(({h,b})=>(
                <div key={h}>
                  <p className="font-semibold mb-1">{h}</p>
                  <p className="text-[var(--text-muted)]">{b}</p>
                </div>
              ))}
            </div>
          </NoteSection>
        </>
      )}
    </div>
  );
}
