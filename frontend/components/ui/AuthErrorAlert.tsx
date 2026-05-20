"use client";

import { AlertCircle } from "lucide-react";
import { getApiErrorPresentation } from "@/lib/apiError";

type AuthErrorAlertProps = {
  error: unknown;
};

export function AuthErrorAlert({ error }: AuthErrorAlertProps) {
  const info = getApiErrorPresentation(error);
  if (!info) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5"
    >
      <div className="flex gap-2 items-start">
        <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-danger text-sm font-medium leading-snug">{info.title}</p>
          {info.description && (
            <p className="text-danger/85 text-xs leading-relaxed">{info.description}</p>
          )}
          {info.technical && (
            <p className="text-white/40 text-[11px] font-mono leading-relaxed break-all pt-0.5 border-t border-white/10 mt-1.5">
              {info.technical}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
