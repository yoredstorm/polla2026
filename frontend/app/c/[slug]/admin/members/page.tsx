"use client";

import { Suspense } from "react";
import { CompetitionPollaAdmin } from "@/components/features/admin/competition/CompetitionPollaAdmin";

export default function CompetitionAdminMembersPage() {
  return (
    <Suspense fallback={<p className="text-muted">Cargando pagos...</p>}>
      <CompetitionPollaAdmin />
    </Suspense>
  );
}
