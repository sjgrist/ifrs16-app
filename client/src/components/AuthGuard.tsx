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
            <svg width="20" height="22" viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2"  width="36" height="8" rx="1.5" fill="white"/>
              <rect x="2" y="13" width="27" height="8" rx="1.5" fill="white"/>
              <rect x="2" y="24" width="18" height="8" rx="1.5" fill="white"/>
              <rect x="2" y="35" width="9"  height="8" rx="1.5" fill="white"/>
            </svg>
          </div>
          <div className="text-sm text-[var(--text-muted)]">Loading…</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
