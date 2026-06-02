"use client";

import { useState } from "react";
import { useAdminFixtures, useEditFixture } from "@/hooks/useAdmin";
import type { AdminFixture } from "@/types/api";

export function useAdminFixturesPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [bettingFilter, setBettingFilter] = useState<"" | "open" | "closed">("");
  const [page, setPage] = useState(1);
  const [settleModal, setSettleModal] = useState<AdminFixture | null>(null);
  const [editModal, setEditModal] = useState<AdminFixture | null>(null);

  const query = useAdminFixtures(statusFilter || undefined, page, 20);
  const editFixture = useEditFixture();

  const rows: AdminFixture[] = query.data?.data ?? [];
  const filtered =
    bettingFilter === ""
      ? rows
      : rows.filter((f) => (bettingFilter === "open" ? f.betting_open : !f.betting_open));

  function quickToggle(f: AdminFixture) {
    editFixture.mutate({ fixtureId: f.id, data: { betting_open: !f.betting_open } });
  }

  function selectStatusFilter(s: string) {
    setStatusFilter(s);
    setPage(1);
  }

  function selectBettingFilter(v: "" | "open" | "closed") {
    setBettingFilter(v);
  }

  return {
    statusFilter,
    bettingFilter,
    page,
    setPage,
    settleModal,
    setSettleModal,
    editModal,
    setEditModal,
    query,
    editFixture,
    filtered,
    quickToggle,
    selectStatusFilter,
    selectBettingFilter,
    statuses: ["", "scheduled", "live", "finished", "cancelled"] as const,
  };
}
