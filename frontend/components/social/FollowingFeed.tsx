"use client";
import Link from "next/link";
import { useFollowingFeed } from "@/hooks/useSocial";

export function FollowingFeed() {
  const { data, isLoading } = useFollowingFeed(12);
  const items = data?.data ?? [];

  if (isLoading) return null;
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-glass p-4 mb-4">
      <h2 className="font-display text-lg text-white mb-3">Apuestas de quien sigues</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.bet_id}>
            <Link
              href={`/fixtures/${item.fixture_id}`}
              className="block rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5 transition-colors"
            >
              <p className="text-sm text-white">
                <span className="text-accent">@{item.username}</span> · {item.home_team} vs {item.away_team}
              </p>
              <p className="text-xs text-muted mt-0.5">
                Pronostico {item.predicted_home_score}–{item.predicted_away_score}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
