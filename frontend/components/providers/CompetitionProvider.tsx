"use client";

import { createContext, useContext } from "react";
import { DEFAULT_COMPETITION_SLUG } from "@/lib/competitionPaths";

const CompetitionSlugContext = createContext<string>(DEFAULT_COMPETITION_SLUG);

export function CompetitionProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return (
    <CompetitionSlugContext.Provider value={slug}>{children}</CompetitionSlugContext.Provider>
  );
}

export function useCompetitionSlug(): string {
  return useContext(CompetitionSlugContext);
}
