"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useFixtureSyncLogs,
  useLiveSyncFixtures,
  useLiveSyncSettings,
  useLiveSyncStatus,
  usePatchFixtureSyncMode,
  useRetryFixtureSync,
  useUpdateLiveSyncSettings,
} from "@/hooks/useAdmin";
import type { LiveSyncFixtureRow } from "@/types/api";
import { competitionFixturesPath } from "@/lib/competitionPaths";
import { cn, formatMatchDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const INTERVAL_PRESETS = [5, 10, 15, 30, 60];

function SyncModeBadge({ mode }: { mode: string }) {
  const styles =
    mode === "auto"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : mode === "failed"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : "border-amber-500/40 bg-amber-500/10 text-amber-200";
  const label =
    mode === "auto" ? "Sync auto" : mode === "failed" ? "Sync fallido" : "Manual";
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", styles)}>
      {label}
    </span>
  );
}

function ConfigPanel() {
  const toast = useToast((s) => s.add);
  const { data: settings, isLoading, isError } = useLiveSyncSettings();
  const { data: status } = useLiveSyncStatus();
  const update = useUpdateLiveSyncSettings();
  const [interval, setInterval] = useState(5);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setInterval(settings.poll_interval_seconds);
      setEnabled(settings.sync_enabled_globally);
    }
  }, [settings]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-glass p-6 animate-pulse h-40" role="status" />
    );
  }

  if (isError || !settings) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" role="alert">
        <p className="text-destructive font-medium">No se pudo cargar la configuración de sync</p>
      </div>
    );
  }

  const showWarning =
    interval < 10 && (status?.active_sync_count ?? 0) > 2;

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    update.mutate(
      { sync_enabled_globally: next },
      {
        onSuccess: () => {
          toast(next ? "Sync automático habilitado" : "Sync automático desactivado", "success");
        },
        onError: () => {
          setEnabled(!next);
          toast("No se pudo cambiar el estado del sync automático", "error");
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-glass p-5 space-y-5" aria-labelledby="sync-config-heading">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 id="sync-config-heading" className="font-display text-lg text-white">
            Configuración global
          </h2>
          <p className="text-xs text-muted mt-1">
            Intervalo de scraping Google · requests/min estimados:{" "}
            {status?.estimated_requests_per_minute ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-0 sm:border-0 sm:bg-transparent">
          <p className="text-xs text-muted mb-2 sm:hidden">
            Usa este control si el sync automático está corrigiendo mal un partido.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={update.isPending}
            onClick={toggleEnabled}
            className={cn(
              "w-full sm:w-auto min-h-11 rounded-xl sm:rounded-full px-3 py-2 sm:py-0",
              "inline-flex items-center justify-between sm:justify-start gap-3",
              "border transition-colors disabled:opacity-60",
              enabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-amber-500/40 bg-amber-500/10 text-amber-100",
            )}
          >
            <span className="text-sm font-medium">
              {enabled ? "Sync automático encendido" : "Sync automático apagado"}
            </span>
            <span
              className={cn(
                "w-11 h-6 rounded-full relative transition-colors shrink-0",
                enabled ? "bg-emerald-500" : "bg-white/20",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                  enabled ? "left-5" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {showWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="alert">
          Intervalo bajo con varios partidos activos. Considera subir a 10-15s para evitar bloqueos.
        </div>
      )}

      <div>
        <label htmlFor="poll-interval" className="text-sm text-muted block mb-2">
          Intervalo de actualización: <strong className="text-white">{interval}s</strong>
        </label>
        <input
          id="poll-interval"
          type="range"
          min={5}
          max={120}
          step={5}
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
          onMouseUp={() => update.mutate({ poll_interval_seconds: interval })}
          onTouchEnd={() => update.mutate({ poll_interval_seconds: interval })}
          className="w-full accent-accent"
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {INTERVAL_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setInterval(p);
                update.mutate({ poll_interval_seconds: p });
              }}
              className={cn(
                "px-3 py-1 rounded-lg text-xs border transition-colors",
                interval === p
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-white/10 text-muted hover:text-white",
              )}
            >
              {p}s
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { label: "Activos", value: status?.active_sync_count ?? 0 },
          { label: "Fallidos", value: status?.failed_sync_count ?? 0 },
          { label: "Manual", value: status?.manual_sync_count ?? 0 },
          { label: "Pre-kickoff", value: `${settings.pre_kickoff_minutes} min` },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <p className="text-[10px] uppercase text-muted">{item.label}</p>
            <p className="text-lg font-bold text-white">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function LogsDrawer({
  fixture,
  onClose,
}: {
  fixture: LiveSyncFixtureRow;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useFixtureSyncLogs(fixture.id);
  const logs = data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Logs de sync">
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Cerrar" />
      <div className="relative w-full max-w-xl bg-surface border-l border-white/10 h-full overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-white">
              {fixture.home_team} vs {fixture.away_team}
            </h3>
            <p className="text-xs text-muted mt-1">Telemetría de scraping Google</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-white text-sm">
            Cerrar
          </button>
        </div>

        <div className="rounded-lg border border-white/10 p-3 text-xs space-y-1">
          <p>
            DB: {fixture.home_score ?? "-"} - {fixture.away_score ?? "-"} · Scraped:{" "}
            {fixture.last_scraped_home ?? "-"} - {fixture.last_scraped_away ?? "-"} (
            {fixture.last_scraped_status ?? "?"})
          </p>
          <p className="text-muted">Fallos: {fixture.consecutive_sync_failures} · Racha confirm: {fixture.sync_confirm_streak}</p>
        </div>

        {isLoading && <p className="text-muted text-sm">Cargando logs...</p>}
        {isError && (
          <div className="text-center space-y-2" role="alert">
            <p className="text-destructive text-sm">Error al cargar logs</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {!isLoading && !isError && logs.length === 0 && (
          <p className="text-muted text-sm text-center py-8">Sin polls registrados aún</p>
        )}

        <ul className="space-y-3" role="list">
          {logs.map((log) => (
            <li
              key={log.id}
              className={cn(
                "rounded-lg border p-3 text-xs space-y-2",
                log.success ? "border-white/10 bg-white/5" : "border-red-500/30 bg-red-500/5",
              )}
            >
              <div className="flex justify-between gap-2">
                <span className="text-muted">{new Date(log.polled_at).toLocaleTimeString()}</span>
                <span className={log.success ? "text-emerald-400" : "text-red-400"}>
                  {log.success ? "OK" : "Error"} · {log.response_ms ?? "?"}ms
                </span>
              </div>
              <p>
                Parseado: {log.parsed_home ?? "?"} - {log.parsed_away ?? "?"} · {log.parsed_status ?? "?"}
                {log.parsed_minute != null ? ` · ${log.parsed_minute}'` : ""}
              </p>
              <p className="text-muted">Acción: {log.action_taken}</p>
              {log.error_message && <p className="text-red-300">{log.error_message}</p>}
              {log.search_url && (
                <p className="truncate text-muted" title={log.search_url}>
                  {log.search_url}
                </p>
              )}
              {log.raw_payload && (
                <details>
                  <summary className="cursor-pointer text-accent">Payload JSON</summary>
                  <pre className="mt-2 overflow-x-auto text-[10px] text-muted whitespace-pre-wrap">
                    {JSON.stringify(log.raw_payload, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FixtureCard({
  fixture,
  fixtureHref,
  onLogs,
  onManual,
  onRetry,
  modePending,
  retryPending,
}: {
  fixture: LiveSyncFixtureRow;
  fixtureHref: string;
  onLogs: () => void;
  onManual: () => void;
  onRetry: () => void;
  modePending: boolean;
  retryPending: boolean;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white font-medium">
            {fixture.home_team} vs {fixture.away_team}
          </p>
          <p className="text-xs text-muted">{formatMatchDate(fixture.match_date)}</p>
        </div>
        <SyncModeBadge mode={fixture.sync_mode} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-white/10 p-2">
          <p className="text-muted">DB</p>
          <p className="text-white font-bold">
            {fixture.home_score ?? "-"}-{fixture.away_score ?? "-"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 p-2">
          <p className="text-muted">Scraped</p>
          <p className="text-accent font-bold">
            {fixture.last_scraped_home ?? "?"}-{fixture.last_scraped_away ?? "?"}
          </p>
          <p className="text-muted truncate">{fixture.last_scraped_status ?? "-"}</p>
        </div>
      </div>
      {fixture.consecutive_sync_failures > 0 && (
        <p className="text-xs text-red-300">{fixture.consecutive_sync_failures} fallos consecutivos</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onLogs}>
          Logs
        </Button>
        <Link
          href={fixtureHref}
          className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-center text-xs font-medium text-muted hover:text-white"
        >
          Partido
        </Link>
        {fixture.sync_mode !== "manual" && (
          <Button type="button" variant="secondary" size="sm" disabled={modePending} onClick={onManual}>
            Pasar a manual
          </Button>
        )}
        {fixture.sync_mode === "failed" && (
          <Button type="button" variant="primary" size="sm" disabled={retryPending} onClick={onRetry}>
            Reintentar sync
          </Button>
        )}
      </div>
    </article>
  );
}

function FixturesTable({ competitionSlug }: { competitionSlug?: string }) {
  const toast = useToast((s) => s.add);
  const { data, isLoading, isError, refetch } = useLiveSyncFixtures();
  const retry = useRetryFixtureSync();
  const patchMode = usePatchFixtureSyncMode();
  const [selected, setSelected] = useState<LiveSyncFixtureRow | null>(null);
  const [focusFixtureId, setFocusFixtureId] = useState<string | null>(null);
  const rows = useMemo(() => data?.data ?? [], [data?.data]);

  useEffect(() => {
    setFocusFixtureId(new URLSearchParams(window.location.search).get("fixture"));
  }, []);

  useEffect(() => {
    if (!focusFixtureId || selected) return;
    const fixture = rows.find((row) => row.id === focusFixtureId);
    if (fixture) setSelected(fixture);
  }, [focusFixtureId, rows, selected]);

  function fixtureHref(fixtureId: string) {
    return competitionSlug ? competitionFixturesPath(competitionSlug, fixtureId) : `/fixtures/${fixtureId}`;
  }

  function setManual(fixtureId: string) {
    patchMode.mutate(
      { fixtureId, sync_mode: "manual" },
      {
        onSuccess: () => toast("Sync del partido desactivado", "success"),
        onError: () => toast("No se pudo pasar el partido a manual", "error"),
      },
    );
  }

  function retryFixture(fixtureId: string) {
    retry.mutate(fixtureId, {
      onSuccess: () => toast("Sync reintentado", "success"),
      onError: () => toast("No se pudo reintentar el sync", "error"),
    });
  }

  if (isLoading) {
    return <p className="text-muted text-sm">Cargando partidos en sync...</p>;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 p-6 text-center space-y-3" role="alert">
        <p className="text-destructive">No se pudieron cargar los partidos</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-muted text-sm" role="status">
        No hay partidos en ventana de sync en este momento
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((f) => (
          <FixtureCard
            key={f.id}
            fixture={f}
            fixtureHref={fixtureHref(f.id)}
            onLogs={() => setSelected(f)}
            onManual={() => setManual(f.id)}
            onRetry={() => retryFixture(f.id)}
            modePending={patchMode.isPending}
            retryPending={retry.isPending}
          />
        ))}
      </div>
      <div className="hidden rounded-xl border border-white/10 overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted text-xs uppercase">
              <th className="text-left px-4 py-3">Partido</th>
              <th className="text-left px-4 py-3">Sync</th>
              <th className="text-left px-4 py-3">DB vs Scraped</th>
              <th className="text-left px-4 py-3">Último poll</th>
              <th className="text-right px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-3">
                  <p className="text-white font-medium">
                    {f.home_team} vs {f.away_team}
                  </p>
                  <p className="text-xs text-muted">{formatMatchDate(f.match_date)}</p>
                </td>
                <td className="px-4 py-3">
                  <SyncModeBadge mode={f.sync_mode} />
                  {f.consecutive_sync_failures > 0 && (
                    <p className="text-[10px] text-red-300 mt-1">{f.consecutive_sync_failures} fallos</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span>
                    {f.home_score ?? "-"}-{f.away_score ?? "-"}
                  </span>
                  <span className="text-muted mx-1">vs</span>
                  <span className="text-accent">
                    {f.last_scraped_home ?? "?"}-{f.last_scraped_away ?? "?"}
                  </span>
                  <p className="text-muted">{f.last_scraped_status ?? "-"}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {f.last_sync_at ? new Date(f.last_sync_at).toLocaleTimeString() : "-"}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelected(f)}
                    className="text-xs text-accent hover:underline"
                  >
                    Logs
                  </button>
                  {f.sync_mode !== "manual" && (
                    <button
                      type="button"
                      onClick={() => setManual(f.id)}
                      disabled={patchMode.isPending}
                      className="text-xs text-muted hover:text-white disabled:opacity-60"
                    >
                      Manual
                    </button>
                  )}
                  {f.sync_mode === "failed" && (
                    <button
                      type="button"
                      onClick={() => retryFixture(f.id)}
                      disabled={retry.isPending}
                      className="text-xs text-emerald-400 hover:underline disabled:opacity-60"
                    >
                      Reintentar
                    </button>
                  )}
                  <Link href={fixtureHref(f.id)} className="text-xs text-muted hover:text-white">
                    Partido
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <LogsDrawer fixture={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

export function LiveSyncAdminPanel({ competitionSlug }: { competitionSlug?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Sync en vivo (Google)</h1>
        <p className="text-sm text-muted mt-1">
          Controla la auto sincronización, desactívala si corrige mal y revisa logs por partido.
        </p>
      </div>
      <ConfigPanel />
      <section className="space-y-3" aria-labelledby="active-sync-heading">
        <h2 id="active-sync-heading" className="font-display text-lg text-white">
          Partidos en sync
        </h2>
        <FixturesTable competitionSlug={competitionSlug} />
      </section>
    </div>
  );
}
