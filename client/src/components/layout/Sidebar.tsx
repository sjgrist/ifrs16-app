import { NavLink } from "react-router-dom";
import { FileText, BarChart2, BookOpen, Percent, Settings, Moon, Sun } from "lucide-react";
import { useAppStore } from "../../lib/store";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/leases",    icon: FileText,  label: "Leases" },
  { to: "/schedules", icon: BarChart2, label: "Schedules" },
  { to: "/journals",  icon: BookOpen,  label: "Journals" },
  { to: "/rates",     icon: Percent,   label: "Discount Rate" },
  { to: "/settings",  icon: Settings,  label: "Settings" },
];

export function Sidebar() {
  const { darkMode, toggleDark } = useAppStore();

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">16</span>
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">IFRS 16</div>
            <div className="text-xs text-[var(--text-muted)]">Lease Manager</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
               isActive
                 ? "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400"
                 : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]")
          }>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Dark mode toggle */}
      <div className="px-2 py-4 border-t border-[var(--border)]">
        <button onClick={toggleDark} className="btn-ghost w-full justify-start">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
      </div>
    </aside>
  );
}
