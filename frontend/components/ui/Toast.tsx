"use client";

import { sileo, Toaster, type SileoOptions } from "sileo";
import { CheckCircle2, Clock, Info, Trophy, XCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

export type ToastType = "success" | "error" | "info";
export type ToastVariant = ToastType | "goal" | "approved" | "rejected" | "deadline";

const TOAST_DURATION = 4000;

const VARIANT_OPTIONS: Record<ToastVariant, (title: string, extra?: Partial<SileoOptions>) => SileoOptions> = {
  success: (title, extra) => ({
    title,
    fill: "#0f2a1a",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
  error: (title, extra) => ({
    title,
    fill: "#2a1215",
    icon: <XCircle className="h-4 w-4 text-red-400" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
  info: (title, extra) => ({
    title,
    fill: "#141820",
    icon: <Info className="h-4 w-4 text-accent" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
  goal: (title, extra) => ({
    title,
    type: "success",
    fill: "#1a472a",
    icon: <Trophy className="h-4 w-4 text-amber-400" aria-hidden />,
    duration: 6000,
    ...extra,
  }),
  approved: (title, extra) => ({
    title,
    fill: "#1e3a5f",
    icon: <CheckCircle2 className="h-4 w-4 text-sky-400" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
  rejected: (title, extra) => ({
    title,
    fill: "#3d1f24",
    icon: <XCircle className="h-4 w-4 text-red-300" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
  deadline: (title, extra) => ({
    title,
    fill: "#3d3214",
    icon: <Clock className="h-4 w-4 text-amber-300" aria-hidden />,
    duration: TOAST_DURATION,
    ...extra,
  }),
};

function dispatchToast(variant: ToastVariant, message: string, extra?: Partial<SileoOptions>) {
  const opts = VARIANT_OPTIONS[variant](message, extra);
  if (variant === "error" || variant === "rejected") return sileo.error(opts);
  if (variant === "deadline") return sileo.warning(opts);
  if (variant === "info") return sileo.info(opts);
  if (variant === "goal") return sileo.show(opts);
  if (extra?.button) return sileo.action(opts);
  return sileo.success(opts);
}

const toastStore = {
  add: (message: string, type: ToastType = "info") => {
    dispatchToast(type, message);
  },
};

export function showToast(message: string, type: ToastType = "info") {
  toastStore.add(message, type);
}

export function showToastVariant(
  variant: ToastVariant,
  message: string,
  extra?: Partial<SileoOptions>,
) {
  dispatchToast(variant, message, extra);
}

export function useToast<T>(selector: (s: typeof toastStore) => T): T {
  return selector(toastStore);
}

/** @deprecated Use SileoToaster in providers instead */
export function ToastContainer() {
  return <SileoToaster />;
}

export function SileoToaster() {
  const isMobile = useIsMobile();

  return (
    <Toaster
      position={isMobile ? "top-center" : "top-right"}
      theme="dark"
      offset={
        isMobile
          ? { top: 16, left: 16, right: 16 }
          : { top: 16, right: 16 }
      }
      options={{ duration: TOAST_DURATION, roundness: 16 }}
    />
  );
}
