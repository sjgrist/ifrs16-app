import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../lib/authStore";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshMe } = useAuthStore();

  useEffect(() => {
    supabase.auth.exchangeCodeForSession(window.location.href).then(async ({ error }) => {
      if (error) {
        navigate("/login");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        useAuthStore.setState({ token: session.access_token });
        await refreshMe();
      }
      navigate("/", { replace: true });
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-sm text-[var(--text-muted)]">Completing sign-in…</div>
    </div>
  );
}
