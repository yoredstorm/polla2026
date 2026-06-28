export const DEFAULT_COMPETITION_SLUG = "mundial-2026";

export function competitionPath(slug: string, segment = ""): string {
  const base = `/c/${slug}`;
  if (!segment) return base;
  return segment.startsWith("/") ? `${base}${segment}` : `${base}/${segment}`;
}

export function competitionDashboardPath(slug: string) {
  return competitionPath(slug, "dashboard");
}

export function competitionFixturesPath(slug: string, fixtureId?: string) {
  return fixtureId
    ? competitionPath(slug, `fixtures/${fixtureId}`)
    : competitionPath(slug, "fixtures");
}
