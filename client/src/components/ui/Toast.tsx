import React, { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "../../lib/utils";

interface Toast { id: number; message: string; type: "success" | "error" | "info"; }

const ToastCtx = createContext<{ toast: (msg: string, type?: Toast["type"]) => void }>({
  toast: () => {},
});

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let seq = 0;

  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            "flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium",
            t.type === "success" && "bg-emerald-600 text-white",
            t.type === "error" && "bg-red-600 text-white",
            t.type === "info" && "bg-brand-600 text-white",
          )}>
            {t.type === "success" && <CheckCircle size={16} className="mt-0.5 shrink-0" />}
            {t.type === "error" && <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            {t.type === "info" && <Info size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
