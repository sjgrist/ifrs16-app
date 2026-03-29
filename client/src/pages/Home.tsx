import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, BarChart2, BookOpen, Percent, Settings,
  ArrowRight, CheckCircle2, Building2, TrendingUp,
  ArrowLeftRight, ChevronRight, ScrollText,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../lib/authStore";

// ─── Module data ──────────────────────────────────────────────────────────────
const MODULES = [
  {
    to: "/leases",
    icon: FileText,
    accent: "from-brand-500 to-blue-600",
    iconBg: "bg-brand-50 dark:bg-brand-900/30",
    iconColor: "text-brand-600 dark:text-brand-400",
    bar: "bg-brand-500",
    title: "Lease Register",
    description: "Manage your full portfolio. Upload PDFs for AI-assisted extraction, record payment terms, track commencement dates.",
    cta: "View leases",
    bullets: ["AI PDF extraction", "CRUD + status tracking", "XLSX export"],
  },
  {
    to: "/schedules",
    icon: BarChart2,
    accent: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
    title: "Amortisation Schedules",
    description: "Month-by-month amortisation and roll-forward reports across your portfolio for any reporting period.",
    cta: "View schedules",
    bullets: ["Effective interest method", "ROU & liability roll-forward", "Current / non-current split"],
  },
  {
    to: "/journals",
    icon: BookOpen,
    accent: "from-emerald-500 to-teal-600",
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    title: "Journal Entries",
    description: "Generate IFRS 16-compliant journal entries for any period, with correct current / non-current liability splits.",
    cta: "View journals",
    bullets: ["Commencement & monthly entries", "Current/non-current reclassification", "CSV / XLSX export"],
  },
  {
    to: "/rates",
    icon: Percent,
    accent: "from-amber-500 to-orange-600",
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    title: "Discount Rate Workbench",
    description: "Build and maintain your IBR library — base rates, credit spreads and security adjustments across currencies and tenors.",
    cta: "View rates",
    bullets: ["IBR = base + spread − security adj", "Currency & tenor matrix", "Audit-ready methodology"],
  },
  {
    to: "/fx-rates",
    icon: ArrowLeftRight,
    accent: "from-sky-500 to-cyan-600",
    iconBg: "bg-sky-50 dark:bg-sky-900/30",
    iconColor: "text-sky-600 dark:text-sky-400",
    bar: "bg-sky-500",
    title: "FX Rates",
    description: "Store and manage exchange rates for multi-currency portfolios. Fetch live rates or enter manually.",
    cta: "View FX rates",
    bullets: ["Live rate lookup (Frankfurter)", "Manual override", "Used in schedule reporting"],
  },
  {
    to: "/disclosure",
    icon: ScrollText,
    accent: "from-rose-500 to-pink-600",
    iconBg: "bg-rose-50 dark:bg-rose-900/30",
    iconColor: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    title: "Note Disclosure",
    description: "Generate a complete, copy-ready IFRS 16 note for annual financial statements — policy, movements, maturity analysis and more.",
    cta: "Generate note",
    bullets: ["Accounting policy text", "ROU asset & liability movements", "Maturity analysis + IBR rates"],
  },
  {
    to: "/settings",
    icon: Settings,
    accent: "from-slate-500 to-slate-600",
    iconBg: "bg-slate-100 dark:bg-slate-800/40",
    iconColor: "text-slate-600 dark:text-slate-400",
    bar: "bg-slate-400",
    title: "Settings",
    description: "Configure legal entities, map account codes to your chart of accounts by asset class, and manage preferences.",
    cta: "Open settings",
    bullets: ["Entity management", "Chart of accounts mapping", "Per-asset-class codes"],
  },
];

const STEPS = [
  { n: "01", text: "Add entities", sub: "Settings → Entities" },
  { n: "02", text: "Set up IBRs", sub: "Discount Rate Workbench" },
  { n: "03", text: "Add leases", sub: "Upload PDFs or enter manually" },
  { n: "04", text: "Generate reports", sub: "Schedules, Journals, FX" },
];

// ─── Page component ───────────────────────────────────────────────────────────
export function HomePage() {
  const navigate = useNavigate();
  const { org } = useAuthStore();
  const [stats, setStats] = useState({ leases: 0, entities: 0, currencies: 0 });

  useEffect(() => {
    Promise.all([
      api.leases.list({ limit: "1" }).then((r) => r.total).catch(() => 0),
      api.entities.list().then((r) => r.length).catch(() => 0),
      api.leases.list().then((r) => new Set(r.leases.map((l) => l.currency)).size).catch(() => 0),
    ]).then(([leases, entities, currencies]) => setStats({ leases, entities, currencies }));
  }, []);

  return (
    <div className="max-w-5xl mx-auto py-8 px-2 space-y-10">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#070e1a] via-[#1a0e2e] to-brand-500 px-8 py-10 text-white shadow-2xl">

        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-20 -right-16 w-80 h-80 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 w-72 h-72 rounded-full bg-orange-400/15 blur-3xl" />
        <div className="pointer-events-none absolute top-6 right-1/3 w-40 h-40 rounded-full bg-white/[0.03] border border-white/5" />

        <div className="relative">
          {/* Logo + org name */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
              <span className="text-white font-bold text-sm tracking-tight">Rℴ</span>
            </div>
            <div>
              <span className="text-white/60 text-xs font-medium tracking-widest uppercase">RoU-lio</span>
              {org?.name && <div className="text-white/80 text-xs">{org.name}</div>}
            </div>
          </div>

          <h1 className="text-3xl font-bold leading-tight mb-3 tracking-tight">
            Lease Accounting,<br />Done Right.
          </h1>
          <p className="text-white/70 text-sm max-w-lg leading-relaxed mb-7">
            End-to-end IFRS 16 compliance — from initial recognition through monthly
            journals, roll-forward disclosures, and multi-currency reporting.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button
              onClick={() => navigate("/leases")}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-[#0b1628] px-5 py-2.5 text-sm font-semibold hover:bg-slate-100 transition-colors shadow"
            >
              Get started <ArrowRight size={14} />
            </button>
            <button
              onClick={() => navigate("/schedules")}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 text-white border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"
            >
              Roll-forward
            </button>
          </div>

          {/* Live stats */}
          <div className="flex flex-wrap gap-6">
            {[
              { icon: FileText,   value: stats.leases,     label: "Leases",     to: "/leases"   },
              { icon: Building2,  value: stats.entities,   label: "Entities",   to: "/settings" },
              { icon: TrendingUp, value: stats.currencies, label: "Currencies", to: "/fx-rates" },
            ].map(({ icon: Icon, value, label, to }) => (
              <button key={label} onClick={() => navigate(to)}
                className="flex items-center gap-2.5 rounded-xl bg-white/10 border border-white/15 px-4 py-2.5 hover:bg-white/20 transition-colors text-left">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                  <Icon size={13} className="text-white/80" />
                </div>
                <div>
                  <div className="text-xl font-bold leading-none">{value}</div>
                  <div className="text-white/60 text-[11px] mt-0.5">{label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Module grid ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Modules</h2>
          <span className="text-xs text-[var(--text-muted)]">{MODULES.length} modules</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map(({ to, icon: Icon, iconBg, iconColor, bar, title, description, cta, bullets }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="card text-left p-0 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 group flex flex-col"
            >
              {/* Coloured top bar */}
              <div className={`h-1 w-full ${bar}`} />
              <div className="p-5 flex flex-col flex-1">
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
                  <Icon size={17} className={iconColor} />
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3 flex-1">
                  {description}
                </p>
                <ul className="space-y-1 mb-4">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <CheckCircle2 size={10} className={iconColor} />
                      {b}
                    </li>
                  ))}
                </ul>
                <span className={`text-xs font-semibold ${iconColor} flex items-center gap-1 group-hover:gap-2 transition-all`}>
                  {cta} <ChevronRight size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Workflow steps ────────────────────────────────────────────────── */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold mb-5">Getting started</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
          {STEPS.map(({ n, text, sub }, i) => (
            <div key={n} className="flex items-start gap-3 relative">
              {/* Connecting line */}
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-4 left-[52px] right-0 h-px bg-[var(--border)]" />
              )}
              <div className="relative z-10 w-8 h-8 rounded-full bg-gradient-to-br from-[#0b1628] to-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow shadow-brand-500/30 ring-1 ring-brand-500/40">
                {n}
              </div>
              <div className="pt-0.5">
                <p className="text-sm font-medium leading-tight">{text}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── IFRS 16 quick-reference ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Initial recognition",
            color: "border-l-brand-500",
            text: "Lease liability = PV of future lease payments discounted at IBR. ROU asset = Lease liability + IDCs + Prepaid − Incentives received.",
          },
          {
            label: "Subsequent measurement",
            color: "border-l-orange-400",
            text: "Liability: effective interest method (IBR × opening balance). ROU asset: straight-line depreciation over lease term.",
          },
          {
            label: "Disclosure",
            color: "border-l-amber-400",
            text: "Current / non-current split required. Roll-forward of ROU asset and lease liability for the period. Interest expense separately disclosed.",
          },
        ].map(({ label, color, text }) => (
          <div key={label} className={`card p-4 border-l-4 ${color}`}>
            <h3 className="text-xs font-semibold mb-2 text-[var(--text-muted)] uppercase tracking-wide">{label}</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
