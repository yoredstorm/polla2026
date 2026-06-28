"use client";
import { useState, useEffect } from "react";
import { useSettleFixture, useEditFixture, useKnownTeams } from "@/hooks/useAdmin";
import { useCompetitionSettleFixture, useCompetitionEditFixture } from "@/hooks/useCompetitionAdmin";
import { useAdminFixturesPage } from "@/hooks/admin/useAdminFixturesPage";
import type { AdminFixture } from "@/types/api";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { formatMatchDate, getStatusLabel, getStatusColor } from "@/lib/utils";
import { SyncStatusBadge } from "@/components/features/admin/SyncStatusBadge";

// ── Settle Modal ────────────────────────────────────────────────────────────
function SettleModal({
  fixture,
  onClose,
  competitionSlug,
}: {
  fixture: { id: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null };
  onClose: () => void;
  competitionSlug?: string;
}) {
  const globalSettle = useSettleFixture();
  const scopedSettle = useCompetitionSettleFixture(competitionSlug);
  const settlePending = competitionSlug ? scopedSettle.isPending : globalSettle.isPending;
  const settleError = competitionSlug ? scopedSettle.isError : globalSettle.isError;
  const [homeScore, setHomeScore] = useState(fixture.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(fixture.away_score ?? 0);
  const [msg, setMsg] = useState<string | null>(null);

  function handleSettle() {
    const opts = {
      onSuccess: (res: { settled_count: number; skipped_unconfirmed_extras?: number }) => {
        let text = `Liquidadas ${res.settled_count} apuestas.`;
        if (res.skipped_unconfirmed_extras && res.skipped_unconfirmed_extras > 0) {
          text += ` ${res.skipped_unconfirmed_extras} extra(s) sin pago confirmado no sumaron puntos.`;
        }
        setMsg(text);
        setTimeout(onClose, 1500);
      },
    };
    if (competitionSlug) {
      scopedSettle.mutate({ fixtureId: fixture.id, homeScore, awayScore }, opts);
    } else {
      globalSettle.mutate({ fixtureId: fixture.id, homeScore, awayScore }, opts);
    }
  }

  return (
    <Modal open onClose={onClose} title="Ingresar Resultado" size="md">
        <p className="text-muted text-sm mb-4">{fixture.home_team} vs {fixture.away_team}</p>
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted">{fixture.home_team}</span>
            <input
              type="number" min={0} value={homeScore}
              onChange={(e) => setHomeScore(Number(e.target.value))}
              className="w-16 text-center bg-white/5 border border-white/10 rounded-lg py-2 text-white text-xl font-bold focus:outline-none focus:border-accent"
            />
          </div>
          <span className="font-display text-2xl text-muted">–</span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted">{fixture.away_team}</span>
            <input
              type="number" min={0} value={awayScore}
              onChange={(e) => setAwayScore(Number(e.target.value))}
              className="w-16 text-center bg-white/5 border border-white/10 rounded-lg py-2 text-white text-xl font-bold focus:outline-none focus:border-accent"
            />
          </div>
        </div>
        {msg && <p className="text-emerald-400 text-sm text-center">{msg}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5">Cancelar</button>
          <button
            onClick={handleSettle}
            disabled={settlePending}
            className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50"
          >
            {settlePending ? "Liquidando..." : "Guardar y Liquidar"}
          </button>
        </div>
        {settleError && <p className="text-danger text-xs text-center">Error al liquidar</p>}
    </Modal>
  );
}

/** API ISO string → value for `input type="datetime-local"` (browser local wall time). */
function isoToDatetimeLocalValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` string (local) → ISO-8601 UTC for the API. */
function datetimeLocalToUtcIso(local: string): string | null {
  const v = local.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ── Edit Modal ──────────────────────────────────────────────────────────────
function EditModal({
  fixture,
  onClose,
  competitionSlug,
}: {
  fixture: AdminFixture;
  onClose: () => void;
  competitionSlug?: string;
}) {
  const globalEdit = useEditFixture();
  const scopedEdit = useCompetitionEditFixture(competitionSlug);
  const editFixture = competitionSlug ? scopedEdit : globalEdit;
  const { data: knownTeams } = useKnownTeams();

  const [homeTeam, setHomeTeam] = useState(fixture.home_team ?? "");
  const [awayTeam, setAwayTeam] = useState(fixture.away_team ?? "");
  const [homeLogoUrl, setHomeLogoUrl] = useState(fixture.home_logo_url ?? "");
  const [awayLogoUrl, setAwayLogoUrl] = useState(fixture.away_logo_url ?? "");
  const [bettingOpen, setBettingOpen] = useState<boolean>(fixture.betting_open ?? false);
  const [venue, setVenue] = useState(fixture.venue ?? "");
  const [matchDateLocal, setMatchDateLocal] = useState(() =>
    isoToDatetimeLocalValue(
      typeof fixture.match_date === "string" ? fixture.match_date : "",
    ),
  );
  const [homeQuery, setHomeQuery] = useState("");
  const [awayQuery, setAwayQuery] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // When team name changes, auto-lookup flag from known teams
  function selectHomeTeam(name: string, flagUrl: string) {
    setHomeTeam(name);
    setHomeLogoUrl(flagUrl);
    setHomeQuery("");
  }
  function selectAwayTeam(name: string, flagUrl: string) {
    setAwayTeam(name);
    setAwayLogoUrl(flagUrl);
    setAwayQuery("");
  }

  const homeMatches = knownTeams?.filter(
    (t) => homeQuery.length >= 2 && t.name.toLowerCase().includes(homeQuery.toLowerCase()),
  ) ?? [];
  const awayMatches = knownTeams?.filter(
    (t) => awayQuery.length >= 2 && t.name.toLowerCase().includes(awayQuery.toLowerCase()),
  ) ?? [];

  function handleSave() {
    setMsg(null);
    const matchIso = datetimeLocalToUtcIso(matchDateLocal);
    editFixture.mutate(
      {
        fixtureId: fixture.id,
        data: {
          home_team: homeTeam || undefined,
          away_team: awayTeam || undefined,
          home_logo_url: homeLogoUrl || undefined,
          away_logo_url: awayLogoUrl || undefined,
          betting_open: bettingOpen,
          venue: venue || undefined,
          ...(matchIso ? { match_date: matchIso } : {}),
        },
      },
      {
        onSuccess: () => {
          setMsg("Guardado correctamente.");
          setTimeout(onClose, 1200);
        },
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Editar Partido" size="md" className="max-h-[90vh] overflow-y-auto">
        <p className="text-xs text-muted bg-white/5 rounded-lg px-3 py-2 mb-4">
          Ronda: <span className="text-white">{fixture.round}</span>
          {fixture.group_name && <> · Grupo: <span className="text-white">{fixture.group_name}</span></>}
        </p>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-4">
          {/* Home team */}
          <div className="space-y-2">
            <label className="text-xs text-muted uppercase tracking-wide">Equipo Local</label>
            <div className="flex items-center gap-2">
              {homeLogoUrl && (
                <img src={homeLogoUrl} alt="" className="w-7 h-5 object-cover rounded-sm shrink-0" />
              )}
              <input
                value={homeTeam}
                onChange={(e) => { setHomeTeam(e.target.value); setHomeQuery(e.target.value); }}
                placeholder="Nombre del equipo"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            {/* Autocomplete dropdown */}
            {homeMatches.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-surface shadow-xl overflow-hidden">
                {homeMatches.slice(0, 6).map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => selectHomeTeam(t.name, t.flag_url)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 text-left"
                  >
                    <img src={t.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm" />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="space-y-2">
            <label className="text-xs text-muted uppercase tracking-wide">Equipo Visitante</label>
            <div className="flex items-center gap-2">
              {awayLogoUrl && (
                <img src={awayLogoUrl} alt="" className="w-7 h-5 object-cover rounded-sm shrink-0" />
              )}
              <input
                value={awayTeam}
                onChange={(e) => { setAwayTeam(e.target.value); setAwayQuery(e.target.value); }}
                placeholder="Nombre del equipo"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            {awayMatches.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-surface shadow-xl overflow-hidden">
                {awayMatches.slice(0, 6).map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => selectAwayTeam(t.name, t.flag_url)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 text-left"
                  >
                    <img src={t.flag_url} alt="" className="w-6 h-4 object-cover rounded-sm" />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Venue */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted uppercase tracking-wide">Estadio / Ciudad</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Ej: Los Angeles (Inglewood)"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
          />
        </div>

        {/* Match date/time (local UI → UTC in API) */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted uppercase tracking-wide">Fecha y hora del partido</label>
          <input
            type="datetime-local"
            value={matchDateLocal}
            onChange={(e) => setMatchDateLocal(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent [color-scheme:dark]"
          />
          <p className="text-[11px] text-muted leading-snug">
            Se muestra en la zona horaria del navegador; al guardar se envía en UTC al servidor.
          </p>
        </div>

        {/* Betting toggle */}
        <div
          onClick={() => setBettingOpen((v) => !v)}
          className={cn(
            "flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors",
            bettingOpen ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
          )}
        >
          <div>
            <p className="text-sm font-medium text-white">Apuestas habilitadas</p>
            <p className={cn("text-xs mt-0.5", bettingOpen ? "text-emerald-300" : "text-red-300")}>
              {bettingOpen
                ? "Los usuarios pueden apostar en este partido"
                : "Las apuestas estan bloqueadas hasta que habilites este partido"}
            </p>
          </div>
          <div className={cn("w-10 h-5 rounded-full relative transition-colors shrink-0 ml-4", bettingOpen ? "bg-emerald-500" : "bg-red-500/50")}>
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", bettingOpen ? "left-5" : "left-0.5")} />
          </div>
        </div>

        {msg && <p className="text-emerald-400 text-sm text-center">{msg}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-muted hover:bg-white/5 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={editFixture.isPending}
            className="flex-1 py-2.5 rounded-lg bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50 text-sm"
          >
            {editFixture.isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
        {editFixture.isError && (
          <p className="text-danger text-xs text-center">Error al guardar los cambios</p>
        )}
    </Modal>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export function FixturesAdminView({ competitionSlug }: { competitionSlug?: string }) {
  const {
    statusFilter,
    bettingFilter,
    page,
    setPage,
    settleModal,
    setSettleModal,
    editModal,
    setEditModal,
    query: { data, isLoading },
    editFixture,
    filtered,
    quickToggle,
    selectStatusFilter,
    selectBettingFilter,
    statuses,
  } = useAdminFixturesPage(competitionSlug);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="font-display text-2xl text-white">Gestionar Partidos</h1>
        <p className="text-xs text-muted sm:ml-auto">
          {data?.pagination.total ?? 0} partidos en total
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => selectStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-colors border",
              statusFilter === s
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted hover:text-white",
            )}
          >
            {s || "Todos"}
          </button>
        ))}
        <span className="w-px bg-white/10 mx-1" />
        {(["", "open", "closed"] as const).map((v) => (
          <button
            key={v}
            onClick={() => selectBettingFilter(v)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-colors border",
              bettingFilter === v
                ? v === "open"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : v === "closed"
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-accent bg-accent/10 text-accent"
                : "border-white/10 text-muted hover:text-white",
            )}
          >
            {v === "" ? "Todas apuestas" : v === "open" ? "Apuestas abiertas" : "Apuestas cerradas"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted">Cargando partidos...</p>
      ) : filtered.length ? (
        <>
          <ul className="md:hidden space-y-3">
            {filtered.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-white/10 bg-glass p-4 space-y-3 cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-medium text-sm">
                    {f.home_team} vs {f.away_team}
                  </p>
                  <span className={cn("text-[10px] uppercase", getStatusColor(f.status))}>
                    {getStatusLabel(f.status)}
                  </span>
                  <SyncStatusBadge syncMode={f.sync_mode} fixtureId={f.id} className="ml-1" />
                </div>
                <p className="text-xs text-muted">{formatMatchDate(f.match_date)}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => quickToggle(f)}
                    className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-full border cursor-pointer",
                      f.betting_open
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-red-500/30 bg-red-500/10 text-red-300",
                    )}
                  >
                    {f.betting_open ? "Apuestas abiertas" : "Apuestas cerradas"}
                  </button>
                  <span className="text-xs text-muted self-center">{f.bet_count} apuestas</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditModal(f)}
                    className="flex-1 text-xs py-2 rounded-lg border border-white/10 text-muted hover:text-white cursor-pointer"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleModal(f)}
                    className="flex-1 text-xs py-2 rounded-lg bg-accent/10 text-accent cursor-pointer"
                  >
                    Resultado
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block rounded-xl border border-white/10 bg-glass backdrop-blur-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">Partido</th>
                  <th className="text-left px-4 py-3">Ronda / Grupo</th>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-center px-4 py-3">Resultado</th>
                  <th className="text-center px-4 py-3">Estado</th>
                  <th className="text-center px-4 py-3">Apuestas</th>
                  <th className="text-right px-4 py-3">Acc.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b border-white/5 hover:bg-white/5">
                    {/* Teams with flags */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {f.home_logo_url && (
                          <img src={f.home_logo_url} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
                        )}
                        <span className="text-white font-medium">{f.home_team}</span>
                        <span className="text-muted text-xs">vs</span>
                        {f.away_logo_url && (
                          <img src={f.away_logo_url} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
                        )}
                        <span className="text-white font-medium">{f.away_team}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      <span>{f.round}</span>
                      {f.group_name && <span className="ml-1 text-white/50">· {f.group_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{formatMatchDate(f.match_date)}</td>
                    <td className="px-4 py-3 text-center text-white font-bold">
                      {f.home_score !== null ? `${f.home_score} – ${f.away_score}` : "–"}
                    </td>
                    <td className={cn("px-4 py-3 text-center text-xs font-medium", getStatusColor(f.status))}>
                      <div className="flex flex-col items-center gap-1">
                        <span>{getStatusLabel(f.status)}</span>
                        <SyncStatusBadge syncMode={f.sync_mode} fixtureId={f.id} />
                      </div>
                    </td>
                    {/* Betting open badge */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => quickToggle(f)}
                        disabled={editFixture.isPending}
                        title={f.betting_open ? "Deshabilitar apuestas" : "Habilitar apuestas"}
                        className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors border",
                          f.betting_open
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            : "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
                        )}
                      >
                        {f.betting_open ? "Abierta" : "Cerrada"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-muted text-xs">{f.bet_count}</td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditModal(f)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-muted hover:text-white hover:bg-white/5 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setSettleModal(f)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                        >
                          Resultado
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.pagination.total_pages > 1 && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm transition-colors",
                    page === p ? "bg-accent text-background" : "text-muted hover:bg-white/10",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">No hay partidos con ese filtro.</p>
      )}

      {settleModal && (
        <SettleModal
          fixture={settleModal}
          onClose={() => setSettleModal(null)}
          competitionSlug={competitionSlug}
        />
      )}
      {editModal && (
        <EditModal
          fixture={editModal}
          onClose={() => setEditModal(null)}
          competitionSlug={competitionSlug}
        />
      )}
    </div>
  );
}
