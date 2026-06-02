"use client";

import { useState } from "react";
import { useFixture } from "@/hooks/useFixtures";
import { useMyBetsForFixture } from "@/hooks/useBets";
import { useActivePolla, useGroupFixtureStandings } from "@/hooks/useGroups";
import {
  useFixtureChallenges,
  useAcceptChallenge,
  useRejectChallenge,
} from "@/hooks/useChallenges";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage } from "@/lib/challengeUtils";
import { isBettingWindowOpen } from "@/lib/matchTiming";

export function useFixtureDetailPage(fixtureId: string) {
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [betPanelMinimized, setBetPanelMinimized] = useState(false);

  const fixtureQuery = useFixture(fixtureId);
  const { data: myBets } = useMyBetsForFixture(fixtureId);
  const { data: polla } = useActivePolla();
  const { data: challenges } = useFixtureChallenges(fixtureId);
  const acceptChallenge = useAcceptChallenge();
  const rejectChallenge = useRejectChallenge();
  const toast = useToast((s) => s.add);

  const fixture = fixtureQuery.data;
  const standingsEnabled = fixture?.status === "finished" && !!polla?.id;
  const standingsQuery = useGroupFixtureStandings(polla?.id ?? "", fixtureId, {
    enabled: standingsEnabled,
  });

  const primaryBet = myBets?.[0];
  const hasBet = (myBets?.length ?? 0) > 0;
  const showBetForm =
    !!fixture &&
    fixture.status === "scheduled" &&
    fixture.betting_open &&
    !fixture.is_locked &&
    isBettingWindowOpen(fixture);

  async function handleAcceptChallenge(challengeId: string) {
    try {
      await acceptChallenge.mutateAsync(challengeId);
      toast("Reto aceptado", "success");
    } catch (err) {
      toast(getApiErrorMessage(err, "No se pudo aceptar el reto"), "error");
    }
  }

  async function handleRejectChallenge(challengeId: string) {
    try {
      await rejectChallenge.mutateAsync(challengeId);
      toast("Reto rechazado", "success");
    } catch (err) {
      toast(getApiErrorMessage(err, "No se pudo rechazar el reto"), "error");
    }
  }

  return {
    challengeOpen,
    setChallengeOpen,
    betPanelMinimized,
    setBetPanelMinimized,
    fixtureQuery,
    fixture,
    myBets,
    polla,
    challenges,
    acceptChallenge,
    rejectChallenge,
    standingsQuery,
    standingsEnabled,
    primaryBet,
    hasBet,
    showBetForm,
    handleAcceptChallenge,
    handleRejectChallenge,
  };
}
