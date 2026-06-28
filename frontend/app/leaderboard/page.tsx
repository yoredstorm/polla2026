import { redirect } from "next/navigation";
import { DEFAULT_COMPETITION_SLUG, competitionPath } from "@/lib/competitionPaths";

export default function LegacyLeaderboardRedirect() {
  redirect(competitionPath(DEFAULT_COMPETITION_SLUG, "leaderboard"));
}
