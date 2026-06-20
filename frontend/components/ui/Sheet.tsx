"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SheetProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: "bottom" | "right";
}

const sideClasses = {
  bottom:
    "fixed inset-x-0 bottom-0 z-50 max-h-[90vh] rounded-t-2xl border border-white/10 bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-slow ease-entrance",
  right:
    "fixed inset-y-0 right-0 z-50 h-full w-full max-w-md border-l border-white/10 bg-surface p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-slow ease-entrance",
};

export function Sheet({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  className,
  side = "bottom",
}: SheetProps) {
  const handleOpenChange = (next: boolean) => {
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content className={cn(sideClasses[side], "focus:outline-none", className)}>
          {title && (
            <Dialog.Title className="font-display text-xl text-white pr-8">{title}</Dialog.Title>
          )}
          {description && (
            <Dialog.Description className="text-sm text-muted mt-1 mb-4">{description}</Dialog.Description>
          )}
          {children}
          <Dialog.Close
            className="absolute top-4 right-4 p-1 rounded-lg text-muted hover:text-white hover:bg-white/10 pressable focus-ring"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
