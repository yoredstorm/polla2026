"use client";
import { useState } from "react";
import {
  useFixtureComments,
  usePostFixtureComment,
  useDeleteFixtureComment,
  useFixtureReactions,
  useSetFixtureReaction,
  type ReactionType,
} from "@/hooks/useSocial";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { CommentMentionInput } from "@/components/social/CommentMentionInput";
import { cn } from "@/lib/utils";

const REACTIONS: { type: ReactionType; label: string; emoji: string }[] = [
  { type: "like", label: "Like", emoji: "👍" },
  { type: "fire", label: "Fuego", emoji: "🔥" },
  { type: "trophy", label: "Trofeo", emoji: "🏆" },
  { type: "wow", label: "Asombro", emoji: "😮" },
  { type: "skull", label: "Muerte", emoji: "💀" },
  { type: "sad", label: "Decepción", emoji: "😢" },
  { type: "angry", label: "Rabia", emoji: "😡" },
  { type: "clown", label: "Payaso", emoji: "🤡" },
  { type: "heart", label: "Corazón", emoji: "❤️" },
];

interface FixtureSocialSectionProps {
  fixtureId: string;
}

function CommentBody({ body, mentions }: { body: string; mentions?: string[] }) {
  const parts = body.split(/(@[a-zA-Z0-9_]{3,50})/g);
  return (
    <p className="text-muted mt-0.5 whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const uname = part.startsWith("@") ? part.slice(1) : null;
        if (uname && mentions?.some((m) => m.toLowerCase() === uname.toLowerCase())) {
          return (
            <span key={i} className="text-accent font-medium">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function socialErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const detail = (err as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "error" in detail) {
    const e = (detail as { error?: { message?: string } }).error;
    return e?.message ?? null;
  }
  return null;
}

export function FixtureSocialSection({ fixtureId }: FixtureSocialSectionProps) {
  const [text, setText] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
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
    setPostError(null);
    try {
      await postComment.mutateAsync(body);
      setText("");
    } catch (err) {
      setPostError(socialErrorMessage(err) ?? "No se pudo publicar el comentario.");
    }
  }

  return (
    <section id="comentarios" className="mb-6 space-y-4 scroll-mt-24">
      <div className="rounded-xl border border-white/10 bg-glass p-4">
        <h3 className="font-display text-sm text-white mb-3">Reacciones</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              title={r.label}
              onClick={() => setReaction.mutate(r.type)}
              disabled={setReaction.isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors shrink-0",
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
        <h3 className="font-display text-sm text-white mb-1">Comentarios del partido</h3>
        <p className="text-[11px] text-muted mb-3">
          Escribe <span className="text-accent">@</span> y elige un miembro de la polla para mencionarlo.
        </p>
        <form onSubmit={handlePost} className="flex gap-2 mb-2">
          <CommentMentionInput
            value={text}
            onChange={setText}
            maxLength={500}
            placeholder="Tu opinión sobre este partido..."
            disabled={postComment.isPending}
          />
          <button
            type="submit"
            disabled={postComment.isPending || !text.trim()}
            className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-bold disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
        {postError && <p className="text-xs text-red-400 mb-3">{postError}</p>}
        <ul className="space-y-3 max-h-64 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-xs text-muted text-center py-4">Sé el primero en comentar.</p>
          ) : (
            comments.map((c) => (
              <li key={c.id} className="text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="flex gap-2">
                  <UserAvatar username={c.username} avatarDisplay={c.avatar_display} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <UserDisplayName
                        username={c.username}
                        firstName={c.first_name}
                        lastName={c.last_name}
                        layout="inline"
                        showUsername
                        linkToProfile
                      />
                      <span className="text-[10px] text-muted shrink-0">
                        {new Date(c.created_at).toLocaleString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <CommentBody body={c.body} mentions={c.mentions} />
                    {c.is_mine && (
                      <button
                        type="button"
                        onClick={() => deleteComment.mutate(c.id)}
                        className="text-[10px] text-red-400/80 hover:underline mt-1"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
