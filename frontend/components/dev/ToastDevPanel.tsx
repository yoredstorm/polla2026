"use client";

import { showToastVariant, type ToastVariant } from "@/components/ui/Toast";

const VARIANTS: ToastVariant[] = [
  "success",
  "error",
  "info",
  "goal",
  "approved",
  "rejected",
  "deadline",
];

const LABELS: Record<ToastVariant, string> = {
  success: "Éxito",
  error: "Error",
  info: "Info",
  goal: "¡GOOOOL! Perú 2 - 1 Brasil",
  approved: "Solicitud aprobada",
  rejected: "Solicitud rechazada",
  deadline: "Cierran apuestas en 15 min",
};

export function ToastDevPanel() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="fixed bottom-20 left-4 z-[70] flex flex-col gap-1 rounded-lg border border-white/10 bg-surface/95 p-2 shadow-xl max-w-[10rem]">
      <p className="text-[10px] text-muted uppercase tracking-wide px-1">Toasts dev</p>
      {VARIANTS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => showToastVariant(v, LABELS[v])}
          className="text-left text-xs px-2 py-1 rounded hover:bg-white/10 text-white"
        >
          {v}
        </button>
      ))}
    </div>
  );
}
