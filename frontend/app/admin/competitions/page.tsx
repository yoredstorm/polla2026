"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  useAdminCompetitions,
  useCreateCompetition,
  useUpdateCompetitionSettings,
  useUpdateScoringRules,
  useUpdatePrizeDistribution,
  useUpdatePaymentSettings,
  useAssignCompetitionAdmin,
} from "@/hooks/useCompetitions";
import { competitionDashboardPath, competitionPath } from "@/lib/competitionPaths";
import { useToast } from "@/components/ui/Toast";

export default function AdminCompetitionsPage() {
  const { data: comps, isLoading, refetch } = useAdminCompetitions();
  const create = useCreateCompetition();
  const updateSettings = useUpdateCompetitionSettings();
  const updateScoring = useUpdateScoringRules();
  const updatePrizes = useUpdatePrizeDistribution();
  const updatePayment = useUpdatePaymentSettings();
  const assignAdmin = useAssignCompetitionAdmin();
  const toast = useToast((s) => s.add);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [exactPts, setExactPts] = useState(2);
  const [winnerPts, setWinnerPts] = useState(1);
  const [adminUserId, setAdminUserId] = useState("");
  const [paymentName, setPaymentName] = useState("");
  const [paymentPhone, setPaymentPhone] = useState("");

  const selected = comps?.find((c) => c.id === selectedId) ?? null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !name.trim()) return;
    try {
      await create.mutateAsync({ slug: slug.trim(), name: name.trim(), status: "draft" });
      toast("Competencia creada", "success");
      setSlug("");
      setName("");
      void refetch();
    } catch {
      toast("No se pudo crear la competencia", "error");
    }
  }

  async function saveLogo() {
    if (!selectedId) return;
    try {
      await updateSettings.mutateAsync({
        id: selectedId,
        settings: { branding: { logo_url: logoUrl || null, primary_color: "#22c55e" } },
      });
      toast("Logo actualizado", "success");
    } catch {
      toast("Error al guardar logo", "error");
    }
  }

  async function saveScoring() {
    if (!selectedId) return;
    try {
      await updateScoring.mutateAsync({
        id: selectedId,
        exact_score_points: exactPts,
        winner_points: winnerPts,
        wrong_points: 0,
      });
      toast("Puntaje guardado", "success");
    } catch {
      toast("Error al guardar puntaje", "error");
    }
  }

  async function savePrizes() {
    if (!selectedId) return;
    try {
      await updatePrizes.mutateAsync({
        id: selectedId,
        places: [
          { place: 1, percent: 60 },
          { place: 2, percent: 30 },
          { place: 3, percent: 10 },
        ],
      });
      toast("Premios 60/30/10 guardados", "success");
    } catch {
      toast("Error al guardar premios", "error");
    }
  }

  async function savePayment() {
    if (!selectedId) return;
    try {
      await updatePayment.mutateAsync({
        id: selectedId,
        contact_name: paymentName || null,
        phone: paymentPhone || null,
      });
      toast("Pagos guardados", "success");
    } catch {
      toast("Error al guardar pagos", "error");
    }
  }

  async function handleAssignAdmin() {
    if (!selectedId || !adminUserId.trim()) return;
    try {
      await assignAdmin.mutateAsync({ competitionId: selectedId, user_id: adminUserId.trim() });
      toast("Admin asignado", "success");
      setAdminUserId("");
    } catch {
      toast("No se pudo asignar admin", "error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Competencias (Super Admin)</h1>

      <form onSubmit={(e) => void handleCreate(e)} className="mb-8 rounded-xl border border-white/10 bg-glass p-4 space-y-3">
        <h2 className="text-sm font-medium text-white">Nueva competencia</h2>
        <input
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          placeholder="slug (ej. liga-1-2026)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <input
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          placeholder="Nombre visible"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Crear competencia
        </Button>
      </form>

      {isLoading ? (
        <p className="text-muted text-sm">Cargando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-3" role="list">
            {(comps ?? []).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-glass px-4 py-3"
              >
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => setSelectedId(c.id)}
                >
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-xs text-muted">{c.slug} · {c.status}</p>
                </button>
                <div className="flex gap-3">
                  <Link
                    href={competitionPath(c.slug, "admin/fixtures")}
                    className="text-sm text-muted hover:text-white"
                  >
                    Importar
                  </Link>
                  <Link
                    href={competitionDashboardPath(c.slug)}
                    className="text-sm text-accent hover:underline"
                  >
                    Abrir
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="rounded-xl border border-white/10 bg-glass p-4 space-y-4">
              <h2 className="text-sm font-medium text-white">Configurar: {selected.name}</h2>

              <div className="space-y-2">
                <label className="text-xs text-muted">Logo URL</label>
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
                <Button type="button" size="sm" onClick={() => void saveLogo()}>
                  Guardar logo
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted">Puntaje (exacto / ganador)</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                    value={exactPts}
                    onChange={(e) => setExactPts(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                    value={winnerPts}
                    onChange={(e) => setWinnerPts(Number(e.target.value))}
                  />
                </div>
                <Button type="button" size="sm" onClick={() => void saveScoring()}>
                  Guardar puntaje
                </Button>
              </div>

              <Button type="button" size="sm" variant="secondary" onClick={() => void savePrizes()}>
                Aplicar premios 60/30/10
              </Button>

              <div className="space-y-2">
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  placeholder="Contacto pagos"
                  value={paymentName}
                  onChange={(e) => setPaymentName(e.target.value)}
                />
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  placeholder="Teléfono pagos"
                  value={paymentPhone}
                  onChange={(e) => setPaymentPhone(e.target.value)}
                />
                <Button type="button" size="sm" onClick={() => void savePayment()}>
                  Guardar pagos
                </Button>
              </div>

              <div className="space-y-2">
                <input
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white font-mono text-xs"
                  placeholder="UUID del usuario admin"
                  value={adminUserId}
                  onChange={(e) => setAdminUserId(e.target.value)}
                />
                <Button type="button" size="sm" onClick={() => void handleAssignAdmin()}>
                  Asignar competition admin
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
