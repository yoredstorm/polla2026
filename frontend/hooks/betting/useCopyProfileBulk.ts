"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useActivePolla } from "@/hooks/useGroups";
import { useFixtures } from "@/hooks/useFixtures";
import { useMyBets } from "@/hooks/useBets";
import type { Bet, Fixture } from "@/types/api";
import { predictionExists } from "@/lib/betPredictionUtils";
import { useToast } from "@/components/ui/Toast";

export interface BulkCopyItem {
  source_bet_id: string;
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  mode: "free" | "extra";
  source_is_extra: boolean;
  fixture?: Fixture;
}

export interface BulkCopyPayloadItem {
  fixture_id: string;
  predicted_home_score: number;
  predicted_away_score: number;
  mode: "free" | "extra";
}

interface BulkCopyResult {
  created: number;
  skipped: number;
  errors: string[];
}

export type CopyProfileStep = "review" | "confirm";

function buildPayloadItems(items: BulkCopyItem[]): BulkCopyPayloadItem[] {
  return items.map((it) => ({
    fixture_id: it.fixture_id,
    predicted_home_score: it.predicted_home_score,
    predicted_away_score: it.predicted_away_score,
    mode: it.mode,
  }));
}

function effectiveExtrasCount(items: BulkCopyItem[]): number {
  return items.filter((i) => i.mode === "extra").length;
}

function effectiveFreeCount(items: BulkCopyItem[]): number {
  return items.filter((i) => i.mode === "free").length;
}

export function useCopyProfileBulk(
  sourceBets: Bet[],
  sourceUserId: string,
  open: boolean,
  onClose: () => void,
) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.add);
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const { data: fixturesPage, isLoading: fixturesLoading } = useFixtures({
    status: "scheduled",
    limit: 200,
  });
  const { data: myBetsPage, isLoading: myBetsLoading } = useMyBets(1, 200);

  const [items, setItems] = useState<BulkCopyItem[]>([]);
  const [step, setStep] = useState<CopyProfileStep>("review");

  const bulkCopy = useMutation({
    mutationFn: (body: { bets: BulkCopyPayloadItem[]; source_user_id: string }) =>
      api.post<BulkCopyResult>("/bets/bulk-copy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-bets"] });
      qc.invalidateQueries({ queryKey: ["bets"] });
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });

  const myFreeFixtureIds = useMemo(() => {
    const s = new Set<string>();
    myBetsPage?.data?.forEach((b) => {
      if (!b.group_id) s.add(b.fixture_id);
    });
    return s;
  }, [myBetsPage]);

  const openFixtureIds = useMemo(() => {
    if (!fixturesPage?.data) return new Set<string>();
    return new Set(
      fixturesPage.data
        .filter((f) => f.betting_open && !f.is_locked && f.status === "scheduled")
        .map((f) => f.id),
    );
  }, [fixturesPage]);

  const fixtureMap = useMemo(() => {
    const m = new Map<string, Fixture>();
    fixturesPage?.data?.forEach((f) => m.set(f.id, f));
    return m;
  }, [fixturesPage]);

  const eligibleBets = useMemo(() => {
    if (!fixturesPage?.data) return [];
    const result: BulkCopyItem[] = [];
    for (const b of sourceBets) {
      if (!openFixtureIds.has(b.fixture_id)) continue;
      const sourceIsExtra = !!b.group_id;
      const viewerHasFree = myFreeFixtureIds.has(b.fixture_id);
      let mode: "free" | "extra";
      if (sourceIsExtra) {
        mode = "extra";
      } else if (viewerHasFree) {
        mode = "extra";
      } else {
        mode = "free";
      }
      result.push({
        source_bet_id: b.id,
        fixture_id: b.fixture_id,
        predicted_home_score: b.predicted_home_score,
        predicted_away_score: b.predicted_away_score,
        mode,
        source_is_extra: sourceIsExtra,
        fixture: fixtureMap.get(b.fixture_id),
      });
    }
    return result;
  }, [sourceBets, fixturesPage, openFixtureIds, myFreeFixtureIds, fixtureMap]);

  useEffect(() => {
    if (!open) return;
    setItems(eligibleBets);
    setStep("review");
    bulkCopy.reset();
  }, [open, eligibleBets]);

  const perMatchAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;
  const currency = polla?.currency ?? "USD";
  const payloadPreview = useMemo(() => buildPayloadItems(items), [items]);
  const extrasCount = effectiveExtrasCount(items);
  const freeCount = effectiveFreeCount(items);
  const totalExtraCost = extrasCount * perMatchAmount;
  const isDataLoading = pollaLoading || fixturesLoading || myBetsLoading;

  const myActiveBets = useMemo(() => myBetsPage?.data ?? [], [myBetsPage]);

  function filterPayloadDuplicates(payload: BulkCopyPayloadItem[]): BulkCopyPayloadItem[] {
    const seenByFixture = new Map<string, { home: number; away: number }[]>();
    for (const b of myActiveBets) {
      const list = seenByFixture.get(b.fixture_id) ?? [];
      list.push({
        home: b.predicted_home_score,
        away: b.predicted_away_score,
      });
      seenByFixture.set(b.fixture_id, list);
    }
    const valid: BulkCopyPayloadItem[] = [];
    for (const row of payload) {
      const existing = (seenByFixture.get(row.fixture_id) ?? []).map((s) => ({
        predicted_home_score: s.home,
        predicted_away_score: s.away,
      }));
      if (predictionExists(row.predicted_home_score, row.predicted_away_score, existing)) {
        continue;
      }
      valid.push(row);
      existing.push({
        predicted_home_score: row.predicted_home_score,
        predicted_away_score: row.predicted_away_score,
      });
      seenByFixture.set(
        row.fixture_id,
        existing.map((e) => ({
          home: e.predicted_home_score,
          away: e.predicted_away_score,
        })),
      );
    }
    return valid;
  }

  function updateItem(idx: number, patch: Partial<BulkCopyItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function itemLabel(item: BulkCopyItem): string {
    if (item.mode === "extra") {
      if (item.source_is_extra) return "Extra (del perfil)";
      return "Extra (ya tienes gratis en este partido)";
    }
    return "Gratis (del perfil)";
  }

  function targetLabel(mode: "free" | "extra"): string {
    return mode === "free" ? "Apuesta gratis" : "Apuesta extra";
  }

  async function handleCopy() {
    const rawPayload = buildPayloadItems(items);
    const payload = filterPayloadDuplicates(rawPayload);
    if (payload.length === 0) {
      if (rawPayload.length > 0) {
        toast(
          "Ninguna apuesta se puede copiar: el marcador ya existe en tus predicciones de ese partido.",
          "error",
        );
      }
      return;
    }
    if (payload.length < rawPayload.length) {
      toast(
        "Algunas apuestas se omitieron porque el marcador ya existe en ese partido.",
        "success",
      );
    }
    try {
      const res = await bulkCopy.mutateAsync({
        bets: payload,
        source_user_id: sourceUserId,
      });
      const total = payload.length;

      if (res.created > 0 && res.errors.length === 0) {
        if (res.skipped > 0) {
          toast(
            `Se copiaron ${res.created} de ${total} apuesta${total !== 1 ? "s" : ""} (${res.skipped} omitida${res.skipped !== 1 ? "s" : ""}).`,
            "success",
          );
        } else {
          toast(
            total === 1
              ? "La apuesta se copió correctamente."
              : `Todas las apuestas se copiaron correctamente (${res.created}).`,
            "success",
          );
        }
        onClose();
        return;
      }

      if (res.created > 0 && res.errors.length > 0) {
        toast(
          `Se copiaron ${res.created} apuesta${res.created !== 1 ? "s" : ""}, con ${res.errors.length} error${res.errors.length !== 1 ? "es" : ""}.`,
          "success",
        );
        toast(res.errors[0] ?? "Error al copiar algunas apuestas", "error");
        onClose();
        return;
      }

      if (res.errors.length > 0) {
        toast(res.errors[0] ?? "No se pudieron copiar las apuestas", "error");
      } else if (res.skipped > 0) {
        toast(
          `No se crearon apuestas nuevas (${res.skipped} omitida${res.skipped !== 1 ? "s" : ""}, quizá ya las tenías).`,
          "error",
        );
      } else {
        toast("No se pudieron copiar las apuestas", "error");
      }
    } catch {
      toast("Error al copiar apuestas", "error");
    }
  }

  return {
    polla,
    step,
    setStep,
    items,
    bulkCopy,
    fixtureMap,
    perMatchAmount,
    currency,
    payloadPreview,
    extrasCount,
    freeCount,
    totalExtraCost,
    isDataLoading,
    updateItem,
    removeItem,
    itemLabel,
    targetLabel,
    handleCopy,
  };
}
