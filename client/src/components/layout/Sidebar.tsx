import { NavLink } from "react-router-dom";
import { Home, FileText, BarChart2, BookOpen, Percent, Settings, Moon, Sun, LogOut, ArrowLeftRight, ScrollText } from "lucide-react";
import { useAppStore } from "../../lib/store";
import { useAuthStore } from "../../lib/authStore";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/",          icon: Home,           label: "Home",          end: true },
  { to: "/leases",    icon: FileText,        label: "Leases" },
  { to: "/schedules", icon: BarChart2,       label: "Schedules" },
  { to: "/journals",  icon: BookOpen,        label: "Journals" },
  { to: "/rates",     icon: Percent,         label: "Discount Rate" },
  { to: "/fx-rates",   icon: ArrowLeftRight,  label: "FX Rates" },
  { to: "/disclosure", icon: ScrollText,      label: "Disclosure" },
  { to: "/settings",   icon: Settings,        label: "Settings" },
];

export function Sidebar() {
  const { darkMode, toggleDark } = useAppStore();
  const { user, org, signOut } = useAuthStore();

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-[#0b1628] border-r border-white/[0.06]">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <span className="text-white text-xs font-bold tracking-tight">Rℴ</span>
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">RoU-lio</div>
            <div className="text-[11px] text-slate-500">{org?.name ?? "Lease accounting"}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-500/20 text-white ring-1 ring-brand-500/30"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]"
            )
          }>
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + controls */}
      <div className="px-2 py-4 border-t border-white/[0.06] space-y-0.5">
        {user && (
          <div className="px-3 py-2 text-xs text-slate-500 truncate">
            {user.name || user.email}
            {org && <span className="ml-1 text-[10px] uppercase opacity-50">({org.role})</span>}
          </div>
        )}
        <button
          onClick={toggleDark}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
