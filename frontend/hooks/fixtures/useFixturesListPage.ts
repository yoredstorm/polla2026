"use client";

import { useEffect, useRef, useState } from "react";
import { useFixtures } from "@/hooks/useFixtures";
import type { FixtureStatus } from "@/types/api";

export function useFixturesListPage() {
  const [groupName, setGroupName] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<FixtureStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const culminadosRef = useRef<HTMLElement>(null);

  const fixturesQuery = useFixtures({
    group_name: groupName,
    status,
    page,
    exclude_finished: status === undefined ? true : undefined,
  });

  const finishedQuery = useFixtures({
    group_name: groupName,
    status: "finished",
    page: 1,
    limit: 12,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#culminados") return;
    const t = window.setTimeout(() => {
      culminadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [finishedQuery.data?.data?.length]);

  function selectGroup(id: string | undefined) {
    setGroupName(id);
    setPage(1);
  }

  function selectStatus(value: FixtureStatus | undefined) {
    setStatus(value);
    setPage(1);
  }

  return {
    groupName,
    status,
    page,
    setPage,
    culminadosRef,
    fixturesQuery,
    finishedQuery,
    selectGroup,
    selectStatus,
  };
}
