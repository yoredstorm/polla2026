"use client";
import Link from "next/link";
import { useRecentActivity } from "@/hooks/useActivity";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ActivityFeedProps {
  limit?: number;
  fixtureId?: string;
  title?: string;
  className?: string;
}

export function ActivityFeed({
  limit = 15,
  fixtureId,
  title = "Actividad reciente",
  className,
}: ActivityFeedProps) {
  const { data, isLoading } = useRecentActivity(limit, fixtureId);
  const items = data?.data ?? [];

  return (
    <section className={cn("rounded-xl border border-white/10 bg-glass p-4", className)}>
      <h2 className="font-display text-lg text-white mb-3">{title}</h2>
      {isLoading ? (
        <p className="text-sm text-muted py-4 text-center">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">Sin actividad publica aun.</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex gap-3 items-start text-sm border-b border-white/5 pb-2 last:border-0"
            >
              <span className="text-[10px] text-muted whitespace-nowrap shrink-0 pt-0.5">
                {formatTime(item.created_at)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase tracking-wide text-accent/80 block mb-0.5">
                  {item.action_label}
                </span>
                <p className="text-muted leading-snug">{item.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!fixtureId && (
        <Link href="/fixtures" className="inline-block mt-3 text-xs text-accent hover:underline">
          Ver partidos
        </Link>
      )}
    </section>
  );
}
