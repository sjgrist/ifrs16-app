import { useNavigate } from "react-router-dom";
import {
  FileText, BarChart2, BookOpen, Percent, Settings,
  ArrowRight, CheckCircle2,
} from "lucide-react";

const MODULES = [
  {
    to: "/leases",
    icon: FileText,
    color: "bg-brand-500",
    lightBg: "bg-brand-50 dark:bg-brand-900/20",
    lightText: "text-brand-600 dark:text-brand-400",
    title: "Lease Register",
    description:
      "Manage your full portfolio of leases. Upload PDFs for AI-assisted data extraction, record payment terms, and track commencement dates.",
    cta: "View leases",
    bullets: ["AI PDF extraction", "CRUD + status tracking", "XLSX export"],
  },
  {
    to: "/schedules",
    icon: BarChart2,
    color: "bg-violet-500",
    lightBg: "bg-violet-50 dark:bg-violet-900/20",
    lightText: "text-violet-600 dark:text-violet-400",
    title: "Amortisation Schedules",
    description:
      "View month-by-month amortisation for each lease and generate roll-forward reports across your portfolio for any reporting period.",
    cta: "View schedules",
    bullets: ["Effective interest method", "ROU & liability roll-forward", "Multi-entity summary"],
  },
  {
    to: "/journals",
    icon: BookOpen,
    color: "bg-emerald-500",
    lightBg: "bg-emerald-50 dark:bg-emerald-900/20",
    lightText: "text-emerald-600 dark:text-emerald-400",
    title: "Journal Entries",
    description:
      "Generate IFRS 16 compliant journal entries for any period. Includes commencement, monthly interest, depreciation, and payment postings.",
    cta: "View journals",
    bullets: ["Commencement & monthly entries", "Balance check", "CSV / XLSX export"],
  },
  {
    to: "/rates",
    icon: Percent,
    color: "bg-amber-500",
    lightBg: "bg-amber-50 dark:bg-amber-900/20",
    lightText: "text-amber-600 dark:text-amber-400",
    title: "Discount Rate Workbench",
    description:
      "Build and maintain your incremental borrowing rate library. Combine base rates, credit spreads, and security adjustments across currencies and tenors.",
    cta: "View rates",
    bullets: ["IBR = base + spread − security adj", "Currency & tenor matrix", "Audit-ready methodology"],
  },
  {
    to: "/settings",
    icon: Settings,
    color: "bg-slate-500",
    lightBg: "bg-slate-100 dark:bg-slate-800/40",
    lightText: "text-slate-600 dark:text-slate-400",
    title: "Settings",
    description:
      "Configure legal entities, map account codes to your chart of accounts by asset class, and manage application-wide preferences.",
    cta: "Open settings",
    bullets: ["Entity management", "Chart of accounts mapping", "Per-asset-class codes"],
  },
];

const STEPS = [
  { n: "1", text: "Add your entities in Settings" },
  { n: "2", text: "Set up discount rates in the IBR workbench" },
  { n: "3", text: "Upload or create leases in the register" },
  { n: "4", text: "Export journals for your accounting system" },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto py-10 px-2 space-y-12">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-500 px-8 py-10 text-white">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-white/5" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">16</span>
            </div>
            <span className="text-white/80 text-sm font-medium tracking-wide uppercase">IFRS 16</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight mb-3">
            Lease Accounting,<br />Done Right
          </h1>
          <p className="text-white/75 text-base max-w-xl leading-relaxed">
            A complete end-to-end tool for IFRS 16 compliance — from initial
            recognition through to monthly journals and roll-forward disclosures.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/leases")}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-brand-600 px-5 py-2.5 text-sm font-semibold hover:bg-brand-50 transition-colors"
            >
              Get started <ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate("/schedules")}
              className="inline-flex items-center gap-2 rounded-lg bg-white/15 text-white px-5 py-2.5 text-sm font-semibold hover:bg-white/25 transition-colors"
            >
              View schedules
            </button>
          </div>
        </div>
      </div>

      {/* Module cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map(({ to, icon: Icon, lightBg, lightText, title, description, cta, bullets }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="card text-left p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group flex flex-col"
            >
              <div className={`w-9 h-9 rounded-lg ${lightBg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={lightText} />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3 flex-1">
                {description}
              </p>
              <ul className="space-y-1 mb-4">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <CheckCircle2 size={11} className={lightText} />
                    {b}
                  </li>
                ))}
              </ul>
              <span className={`text-xs font-medium ${lightText} flex items-center gap-1 group-hover:gap-2 transition-all`}>
                {cta} <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Getting started */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold mb-4">Getting started</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STEPS.map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {n}
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
