import { redirect } from "next/navigation";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";

export default function Home() {
  redirect("/competitions");
}
