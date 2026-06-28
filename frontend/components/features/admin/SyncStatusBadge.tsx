import Link from "next/link";
import { cn } from "@/lib/utils";

export function SyncStatusBadge({
  syncMode,
  fixtureId,
  className,
}: {
  syncMode?: "auto" | "manual" | "failed" | string;
  fixtureId?: string;
  className?: string;
}) {
  const mode = syncMode ?? "auto";
  const styles =
    mode === "auto"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : mode === "failed"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-amber-500/40 bg-amber-500/10 text-amber-200";
  const label =
    mode === "auto" ? "Sync auto" : mode === "failed" ? "Sync fallido" : "Manual";

  const badge = (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase",
        styles,
        className,
      )}
    >
      {label}
    </span>
  );

  if (fixtureId) {
    return (
      <Link
        href={`/admin/live-sync?fixture=${fixtureId}`}
        className="inline-flex hover:opacity-80"
        title="Ver logs de sync"
      >
        {badge}
      </Link>
    );
  }

  return badge;
}
