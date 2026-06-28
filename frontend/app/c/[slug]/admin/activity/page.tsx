"use client";

import { useState } from "react";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useCompetitionAdminAuditLog } from "@/hooks/useCompetitionAdmin";
import { cn } from "@/lib/utils";

export default function CompetitionAdminActivityPage() {
  const slug = useCompetitionSlug();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useCompetitionAdminAuditLog(page, 50, actionFilter, slug);
  const logs = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Actividad</h1>
        <p className="text-sm text-muted mt-1">Registro de acciones en esta competencia.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setActionFilter(undefined);
            setPage(1);
          }}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm border",
            !actionFilter ? "border-accent bg-accent/10 text-accent" : "border-white/10 text-muted",
          )}
        >
          Todos
        </button>
      </div>

      {isLoading ? (
        <p className="text-muted">Cargando actividad...</p>
      ) : logs.length === 0 ? (
        <p className="text-muted text-sm text-center py-12">Sin registros.</p>
      ) : (
        <ul className="rounded-xl border border-white/10 bg-glass divide-y divide-white/5">
          {logs.map((entry) => (
            <li key={entry.id} className="px-4 py-3 text-sm">
              <div className="flex justify-between gap-2 text-[10px] text-muted uppercase tracking-wide">
                <span>{entry.action_label}</span>
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString("es-PE")}
                </time>
              </div>
              <p className="text-muted mt-1 leading-snug">{entry.detail_summary}</p>
              {entry.username && (
                <p className="text-[10px] text-accent/80 mt-0.5">@{entry.username}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.pagination.total_pages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={cn(
                "w-8 h-8 rounded-lg text-sm",
                page === p ? "bg-accent text-background" : "text-muted hover:bg-white/10",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
