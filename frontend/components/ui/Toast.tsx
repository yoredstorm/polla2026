"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  _nextId: number;
  add: (message: string, type?: ToastType) => void;
  remove: (id: number) => void;
}

export const useToast = create<ToastStore>((set, get) => ({
  toasts: [],
  _nextId: 1,
  add: (message, type = "info") => {
    const id = get()._nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }], _nextId: id + 1 }));
    setTimeout(() => get().remove(id), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const TYPE_STYLES: Record<ToastType, string> = {
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  error: "border-red-500/40 bg-red-500/15 text-red-200",
  info: "border-accent/40 bg-accent/15 text-accent",
};

export function ToastContainer() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const el = document.getElementById(`toast-${toast.id}`);
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateX(20px)";
      requestAnimationFrame(() => {
        el.style.transition = "opacity 200ms ease, transform 200ms ease";
        el.style.opacity = "1";
        el.style.transform = "translateX(0)";
      });
    }
  }, [toast.id]);

  return (
    <div
      id={`toast-${toast.id}`}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md flex items-start gap-2",
        TYPE_STYLES[toast.type],
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 text-xs mt-0.5">&times;</button>
    </div>
  );
}
