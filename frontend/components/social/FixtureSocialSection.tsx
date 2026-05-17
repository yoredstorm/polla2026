"use client";
import { useState } from "react";
import {
  useFixtureComments,
  usePostFixtureComment,
  useDeleteFixtureComment,
  useFixtureReactions,
  useSetFixtureReaction,
} from "@/hooks/useSocial";
import { cn } from "@/lib/utils";

const REACTIONS: { type: "like" | "fire" | "trophy"; label: string; emoji: string }[] = [
  { type: "like", label: "Like", emoji: "👍" },
  { type: "fire", label: "Fuego", emoji: "🔥" },
  { type: "trophy", label: "Trofeo", emoji: "🏆" },
];

interface FixtureSocialSectionProps {
  fixtureId: string;
}

export function FixtureSocialSection({ fixtureId }: FixtureSocialSectionProps) {
  const [text, setText] = useState("");
  const { data: commentsData } = useFixtureComments(fixtureId);
  const { data: reactionsData } = useFixtureReactions(fixtureId);
  const postComment = usePostFixtureComment(fixtureId);
  const deleteComment = useDeleteFixtureComment(fixtureId);
  const setReaction = useSetFixtureReaction(fixtureId);

  const comments = commentsData?.data ?? [];
  const counts = reactionsData?.counts ?? {};
  const myReaction = reactionsData?.my_reaction;

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    await postComment.mutateAsync(body);
    setText("");
  }

  return (
    <section className="mb-6 space-y-4">
      <div className="rounded-xl border border-white/10 bg-glass p-4">
        <h3 className="font-display text-sm text-white mb-3">Reacciones</h3>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => setReaction.mutate(r.type)}
              disabled={setReaction.isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors",
                myReaction === r.type
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-white/15 text-muted hover:border-white/30",
              )}
            >
              <span>{r.emoji}</span>
              <span>{counts[r.type] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-glass p-4">
        <h3 className="font-display text-sm text-white mb-3">Comentarios del partido</h3>
        <form onSubmit={handlePost} className="flex gap-2 mb-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder="Tu opinion sobre este partido..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            disabled={postComment.isPending || !text.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-bold disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
        <ul className="space-y-3 max-h-64 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-xs text-muted text-center py-4">Se el primero en comentar.</p>
          ) : (
            comments.map((c) => (
              <li key={c.id} className="text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-accent">@{c.username}</span>
                  <span className="text-[10px] text-muted shrink-0">
                    {new Date(c.created_at).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-muted mt-0.5">{c.body}</p>
                {c.is_mine && (
                  <button
                    type="button"
                    onClick={() => deleteComment.mutate(c.id)}
                    className="text-[10px] text-red-400/80 hover:underline mt-1"
                  >
                    Eliminar
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
