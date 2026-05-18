"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ModalSize = "sm" | "md" | "lg" | "xl";

export interface ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called when the dialog closes (Radix open → false). */
  onClose?: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  size?: ModalSize;
  hideCloseButton?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export function modalCloseHandler(onClose: () => void, onOpenChange?: (open: boolean) => void) {
  return (open: boolean) => {
    onOpenChange?.(open);
    if (!open) onClose();
  };
}

export function Modal({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  className,
  overlayClassName,
  size = "md",
  hideCloseButton = false,
}: ModalProps) {
  const handleOpenChange = (next: boolean) => {
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            overlayClassName,
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-h-[min(90vh,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2",
            "overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 shadow-xl focus:outline-none",
            sizeClasses[size],
            className,
          )}
        >
          {title && (
            <Dialog.Title className="font-display text-xl text-white pr-8">{title}</Dialog.Title>
          )}
          {description && (
            <Dialog.Description className="text-sm text-muted mt-1 mb-4">{description}</Dialog.Description>
          )}
          {children}
          {!hideCloseButton && (
            <Dialog.Close
              className="absolute top-4 right-4 p-1 rounded-lg text-muted hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer focus-ring"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </Dialog.Close>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
