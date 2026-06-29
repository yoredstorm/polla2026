"use client";

import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { LiveSyncAdminPanel } from "@/components/features/admin/LiveSyncAdminPanel";

export default function CompetitionAdminLiveSyncPage() {
  const slug = useCompetitionSlug();
  return <LiveSyncAdminPanel competitionSlug={slug} />;
}
