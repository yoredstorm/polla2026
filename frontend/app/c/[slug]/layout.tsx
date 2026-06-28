"use client";

import { useParams } from "next/navigation";
import { CompetitionProvider } from "@/components/providers/CompetitionProvider";

export default function CompetitionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  return <CompetitionProvider slug={slug}>{children}</CompetitionProvider>;
}
