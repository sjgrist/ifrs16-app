import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { ToastProvider } from "./components/ui/Toast";
import { LeasesPage } from "./pages/Leases";
import { SchedulesPage } from "./pages/Schedules";
import { JournalsPage } from "./pages/Journals";
import { DiscountRatePage } from "./pages/DiscountRate";
import { SettingsPage } from "./pages/Settings";
import { useAppStore } from "./lib/store";

export default function App() {
  const { darkMode } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/leases" replace />} />
              <Route path="/leases" element={<LeasesPage />} />
              <Route path="/schedules" element={<SchedulesPage />} />
              <Route path="/journals" element={<JournalsPage />} />
              <Route path="/rates" element={<DiscountRatePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}
