import { redirect } from "next/navigation";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";

export default function DashboardRedirectPage() {
  redirect(`/c/${DEFAULT_COMPETITION_SLUG}/dashboard`);
}
