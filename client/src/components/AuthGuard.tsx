import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/authStore";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, org, loading, init } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (loading) return;
    const publicRoutes = ["/login", "/auth/callback"];
    const isPublic = publicRoutes.includes(location.pathname);

    if (!user) {
      if (!isPublic) navigate("/login", { replace: true });
    } else if (!org) {
      if (location.pathname !== "/create-org") navigate("/create-org", { replace: true });
    } else {
      // Authenticated with org — redirect away from public/setup pages
      if (isPublic || location.pathname === "/create-org") navigate("/", { replace: true });
    }
  }, [user, org, loading, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white text-sm font-bold">16</span>
          </div>
          <div className="text-sm text-[var(--text-muted)]">Loading…</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
