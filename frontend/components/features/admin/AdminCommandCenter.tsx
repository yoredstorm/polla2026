"use client";
import Link from "next/link";
import { AlertTriangle, Clock, FileCheck, Zap } from "lucide-react";
import { useAdminActionQueue } from "@/hooks/useAdmin";
import { FixtureDeadlineCountdown } from "@/components/features/betting/FixtureDeadlineCountdown";
import { cn } from "@/lib/utils";

function urgencyStyles(urgency: string) {
  if (urgency === "high") return "border-red-500/40 bg-red-500/10";
  if (urgency === "medium") return "border-amber-500/40 bg-amber-500/10";
  return "border-white/10 bg-glass";
}

export function AdminCommandCenter() {
  const { data, isLoading } = useAdminActionQueue();

  if (isLoading) {
    return <p className="text-muted text-sm">Cargando centro de mando...</p>;
  }
  if (!data) return null;

  const { pending, fixtures_attention, recent_critical, group_id } = data;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-xl text-white mb-3 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" aria-hidden />
          Cola de decisiones
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QueueCard
            label="Solicitudes apuesta"
            count={pending.change_requests}
            href="/admin/requests"
          />
          <QueueCard
            label="Recuperar clave"
            count={pending.password_resets}
            href="/admin/requests?tab=passwords"
          />
          <QueueCard
            label="Entradas pendientes"
            count={pending.entries}
            href={group_id ? `/admin/groups` : "/admin/groups"}
          />
          <QueueCard
            label="Extras sin confirmar"
            count={pending.extras}
            href={group_id ? `/admin/groups` : "/admin/groups"}
          />
        </div>
        {pending.total > 0 && (
          <p className="text-xs text-muted mt-2">
            {pending.total} elemento(s) requieren tu atencion.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl text-white mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-accent" aria-hidden />
          Partidos que requieren atencion
        </h2>
        {fixtures_attention.length === 0 ? (
          <p className="text-sm text-muted rounded-xl border border-white/10 bg-glass p-4">
            No hay partidos urgentes en las proximas 2 horas.
          </p>
        ) : (
          <ul className="space-y-3">
            {fixtures_attention.map((fx) => (
              <li
                key={fx.id}
                className={cn(
                  "rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
                  urgencyStyles(fx.urgency),
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {fx.urgency === "high" && (
                      <span className="text-[10px] uppercase tracking-wide text-red-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" aria-hidden />
                        Urgente
                      </span>
                    )}
                    <span className="text-white font-medium truncate">
                      {fx.home_team} vs {fx.away_team}
                    </span>
                    <span className="text-[10px] uppercase text-muted">{fx.status}</span>
                  </div>
                  {fx.betting_open && fx.betting_closes_at && (
                    <p className="text-xs text-muted mt-1 flex items-center gap-1">
                      <FixtureDeadlineCountdown
                        deadlineMs={new Date(fx.betting_closes_at).getTime()}
                        label="Cierra apuestas"
                        compact
                        className="inline-flex"
                      />
                    </p>
                  )}
                  {fx.status === "finished" && (fx.home_score == null || fx.away_score == null) && (
                    <p className="text-xs text-amber-300 mt-1">Falta liquidar resultado</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Link
                    href={`/admin/fixtures`}
                    className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs font-medium hover:bg-accent/30 transition-colors cursor-pointer focus-ring"
                  >
                    Gestionar
                  </Link>
                  <Link
                    href={`/fixtures/${fx.id}`}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-muted text-xs hover:text-white transition-colors cursor-pointer focus-ring"
                  >
                    Ver partido
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-xl text-white mb-3 flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-accent" aria-hidden />
          Actividad critica reciente
        </h2>
        {recent_critical.length === 0 ? (
          <p className="text-sm text-muted">Sin eventos recientes.</p>
        ) : (
          <ul className="rounded-xl border border-white/10 bg-glass divide-y divide-white/5 max-h-64 overflow-y-auto">
            {recent_critical.map((item) => (
              <li key={item.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-2 text-[10px] text-muted uppercase tracking-wide">
                  <span>{item.action_label}</span>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="text-muted mt-0.5 leading-snug">{item.summary}</p>
                {item.username && (
                  <p className="text-[10px] text-accent/80 mt-0.5">@{item.username}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/admin/activity"
          className="inline-block mt-2 text-xs text-accent hover:underline cursor-pointer"
        >
          Ver actividad completa
        </Link>
      </section>
    </div>
  );
}

function QueueCard({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl border p-4 transition-colors duration-200 cursor-pointer focus-ring",
        count > 0
          ? "border-accent/40 bg-accent/10 hover:bg-accent/15"
          : "border-white/10 bg-glass hover:bg-white/5",
      )}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("font-display text-2xl mt-1", count > 0 ? "text-accent" : "text-white")}>
        {count}
      </p>
    </Link>
  );
}
