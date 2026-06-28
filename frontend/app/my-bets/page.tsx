import { redirect } from "next/navigation";
import { DEFAULT_COMPETITION_SLUG, competitionPath } from "@/lib/competitionPaths";

export default function LegacyMyBetsRedirect() {
  redirect(competitionPath(DEFAULT_COMPETITION_SLUG, "my-bets"));
}
