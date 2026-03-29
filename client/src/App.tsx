import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { ToastProvider } from "./components/ui/Toast";
import { AuthGuard } from "./components/AuthGuard";
import { HomePage } from "./pages/Home";
import { LeasesPage } from "./pages/Leases";
import { SchedulesPage } from "./pages/Schedules";
import { JournalsPage } from "./pages/Journals";
import { DiscountRatePage } from "./pages/DiscountRate";
import { FxRatesPage } from "./pages/FxRates";
import { SettingsPage } from "./pages/Settings";
import { DisclosurePage } from "./pages/Disclosure";
import { LoginPage } from "./pages/Login";
import { CreateOrgPage } from "./pages/CreateOrg";
import { AuthCallbackPage } from "./pages/AuthCallback";
import { useAppStore } from "./lib/store";

function AppLayout() {
  const location = useLocation();
  const noShell = ["/login", "/create-org", "/auth/callback"].includes(location.pathname);

  if (noShell) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/create-org" element={<CreateOrgPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/leases" element={<LeasesPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/journals" element={<JournalsPage />} />
          <Route path="/rates" element={<DiscountRatePage />} />
          <Route path="/fx-rates" element={<FxRatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/disclosure" element={<DisclosurePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { darkMode } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthGuard>
          <AppLayout />
        </AuthGuard>
      </BrowserRouter>
    </ToastProvider>
  );
}
