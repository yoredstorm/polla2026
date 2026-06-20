"use client";

import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { entranceTransition, exitTransition } from "@/lib/motion";
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
  success: "border-success/40 bg-success/15 text-emerald-200",
  error: "border-danger/40 bg-danger/15 text-red-200",
  info: "border-accent/40 bg-accent/15 text-accent",
};

const TYPE_ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastContainer() {
  const toasts = useToast((s) => s.toasts);
  const remove = useToast((s) => s.remove);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm toast-mobile-offset md:bottom-4">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = TYPE_ICONS[toast.type];
  const reduced = useReducedMotion();

  return (
    <motion.div
      layout
      variants={{
        initial: { opacity: 0, x: reduced ? 0 : 20 },
        animate: {
          opacity: 1,
          x: 0,
          transition: entranceTransition(),
        },
        exit: {
          opacity: 0,
          x: reduced ? 0 : 20,
          transition: exitTransition(),
        },
      }}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md flex items-start gap-2",
        TYPE_STYLES[toast.type],
      )}
      role="status"
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 text-xs mt-0.5 cursor-pointer focus-ring rounded pressable"
        aria-label="Cerrar"
      >
        &times;
      </button>
    </motion.div>
  );
}
