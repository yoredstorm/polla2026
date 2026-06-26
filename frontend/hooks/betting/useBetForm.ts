"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Fixture } from "@/types/api";
import { useCreateBet, useMyBetsForFixture } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { isBettingWindowOpen } from "@/lib/matchTiming";
import { useToast } from "@/components/ui/Toast";
import { predictionExists, DUPLICATE_PREDICTION_MESSAGE } from "@/lib/betPredictionUtils";

export const betSchema = z.object({
  predicted_home_score: z.number().min(0).max(20),
  predicted_away_score: z.number().min(0).max(20),
});

export type BetFormValues = z.infer<typeof betSchema>;

export function useBetForm(fixture: Fixture) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingValues, setPendingValues] = useState<BetFormValues | null>(null);
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [showExtraConfirm, setShowExtraConfirm] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [extraPending, setExtraPending] = useState<BetFormValues | null>(null);

  const createBet = useCreateBet();
  const { data: existingBets, isLoading: betsLoading } = useMyBetsForFixture(fixture.id);
  const { data: polla, isLoading: pollaLoading } = useActivePolla();
  const toast = useToast((s) => s.add);

  const { handleSubmit, watch, setValue } = useForm<BetFormValues>({
    resolver: zodResolver(betSchema),
    defaultValues: { predicted_home_score: 1, predicted_away_score: 0 },
  });
  const homeScore = watch("predicted_home_score");
  const awayScore = watch("predicted_away_score");

  const freeBet = existingBets?.find((b) => !b.group_id) ?? null;
  const extraBets = existingBets?.filter((b) => !!b.group_id) ?? [];
  const currency = polla?.currency ?? "USD";
  const extraAmount = polla?.per_match_amount ? parseFloat(polla.per_match_amount) : 0;
  const fixtureOpen =
    !fixture.is_locked &&
    fixture.status === "scheduled" &&
    fixture.betting_open &&
    isBettingWindowOpen(fixture);
  const canAddExtra = !!polla && polla.is_member && extraAmount > 0 && fixtureOpen;
  const existingPredictions = [...(freeBet ? [freeBet] : []), ...extraBets];

  function extraScoreIsDuplicate(home: number, away: number): boolean {
    return predictionExists(home, away, existingPredictions);
  }

  const extraDuplicate =
    extraPending != null &&
    extraScoreIsDuplicate(extraPending.predicted_home_score, extraPending.predicted_away_score);

  function onSubmit(values: BetFormValues) {
    setPendingValues(values);
    setShowConfirm(true);
  }

  function confirmMainBet() {
    if (!pendingValues) return;
    createBet.mutate(
      {
        fixture_id: fixture.id,
        predicted_home_score: pendingValues.predicted_home_score,
        predicted_away_score: pendingValues.predicted_away_score,
      },
      {
        onSuccess: () => {
          setShowConfirm(false);
          setShowSaveSuccess(true);
          window.setTimeout(() => setShowSaveSuccess(false), 2500);
          toast("Apuesta guardada correctamente", "success");
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "error" in err
              ? String((err as { error?: { message?: string } }).error?.message ?? "")
              : "";
          toast(msg || "Error al guardar la apuesta", "error");
        },
      },
    );
  }

  function onExtraSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!extraPending) return;
    if (extraScoreIsDuplicate(extraPending.predicted_home_score, extraPending.predicted_away_score)) {
      toast(DUPLICATE_PREDICTION_MESSAGE, "error");
      return;
    }
    setShowExtraForm(false);
    setShowExtraConfirm(true);
  }

  function confirmExtraBet() {
    if (!extraPending || !polla) return;
    if (extraScoreIsDuplicate(extraPending.predicted_home_score, extraPending.predicted_away_score)) {
      toast(DUPLICATE_PREDICTION_MESSAGE, "error");
      return;
    }
    createBet.mutate(
      {
        fixture_id: fixture.id,
        predicted_home_score: extraPending.predicted_home_score,
        predicted_away_score: extraPending.predicted_away_score,
        group_id: polla.id,
        amount: extraAmount,
      },
      {
        onSuccess: () => {
          setShowExtraConfirm(false);
          setExtraPending(null);
          toast("Apuesta extra guardada. Pendiente de confirmacion del admin.", "success");
        },
        onError: (err: unknown) => {
          const msg =
            err && typeof err === "object" && "error" in err
              ? String((err as { error?: { message?: string } }).error?.message ?? "")
              : "";
          toast(msg || "Error al guardar la apuesta extra", "error");
        },
      },
    );
  }

  return {
    showConfirm,
    setShowConfirm,
    pendingValues,
    showExtraForm,
    setShowExtraForm,
    showExtraConfirm,
    setShowExtraConfirm,
    extraPending,
    setExtraPending,
    createBet,
    betsLoading,
    polla,
    pollaLoading,
    handleSubmit,
    setValue,
    homeScore,
    awayScore,
    freeBet,
    extraBets,
    currency,
    extraAmount,
    fixtureOpen,
    canAddExtra,
    extraDuplicate,
    onSubmit,
    confirmMainBet,
    onExtraSubmit,
    confirmExtraBet,
    showSaveSuccess,
  };
}
