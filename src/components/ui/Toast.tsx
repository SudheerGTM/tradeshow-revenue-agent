"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<ToastVariant, { bg: string; border: string; text: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  success: { bg: "#dcfce7", border: "#16A34A", text: "#15803d", icon: CheckCircle2 },
  error:   { bg: "#fee2e2", border: "#DC2626", text: "#b91c1c", icon: XCircle },
  info:    { bg: "#e6f8fc", border: "#00B8D9", text: "#0F4C81", icon: Info },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm
                   bottom-20 left-4 right-4 sm:bottom-4 sm:left-auto sm:right-4 sm:w-full"
      >
        {toasts.map(t => {
          const s = VARIANT_STYLE[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className="flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg animate-in"
              style={{ background: s.bg, borderColor: s.border }}
            >
              <s.icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: s.text }} />
              <p className="text-sm flex-1" style={{ color: s.text }}>{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="shrink-0" style={{ color: s.text }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
