"use client";
import { MotionSafe } from "@/components/ui/MotionSafe";
import type { Challenge } from "@/hooks/useChallenges";
import { challengeStatusLabel } from "@/lib/challengeUtils";
import { entranceTransition, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { Button } from "@/components/ui/Button";

function Fighter({
  username,
  firstName,
  lastName,
  avatarDisplay,
  highlight,
  isWinner,
}: {
  username: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarDisplay?: string | null;
  highlight?: boolean;
  isWinner?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className={cn(isWinner && "ring-2 ring-yellow-400/60 rounded-full")}>
        <UserAvatar
          username={username ?? "?"}
          avatarDisplay={avatarDisplay}
          size="sm"
          className={cn(
            "w-14 h-14 text-xl border-2",
            highlight ? "border-accent" : "border-white/20",
          )}
        />
      </div>
      <UserDisplayName
        username={username ?? "?"}
        firstName={firstName}
        lastName={lastName}
        className="items-center max-w-full"
        nameClassName={cn("text-sm", highlight ? "text-accent" : "text-white")}
      />
    </div>
  );
}

interface ChallengeCardProps {
  challenge: Challenge;
  currentUserId?: string;
  hasBet?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  acceptPending?: boolean;
  rejectPending?: boolean;
  index?: number;
}

export function ChallengeCard({
  challenge: ch,
  currentUserId,
  hasBet = true,
  onAccept,
  onReject,
  acceptPending,
  rejectPending,
  index = 0,
}: ChallengeCardProps) {
  const isChallenged = ch.challenged_id === currentUserId;
  const canRespond = ch.status === "pending_accept" && isChallenged;
  const isPending = ch.status === "pending_accept";

  return (
    <MotionSafe
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={entranceTransition(staggerDelay(index))}
      className={cn(
        "rounded-2xl border bg-gradient-to-b from-white/[0.06] to-transparent p-4",
        isPending ? "border-accent/40" : "border-white/10",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isPending ? "bg-accent/20 text-accent animate-pulse" : "bg-white/10 text-muted",
          )}
        >
          {challengeStatusLabel(ch.status)}
        </span>
        <span className="font-display text-lg text-accent">{ch.stake_points} pts</span>
      </div>

      <div className="flex items-center gap-3">
        <Fighter
          username={ch.challenger_username}
          firstName={ch.challenger_first_name}
          lastName={ch.challenger_last_name}
          avatarDisplay={ch.challenger_avatar_display}
          highlight={ch.challenger_id === currentUserId}
          isWinner={ch.status === "settled" && ch.winner_id === ch.challenger_id}
        />
        <div className="flex flex-col items-center shrink-0 px-1">
          <span className="font-display text-2xl text-white/90 tracking-widest">VS</span>
          <span className="text-[10px] text-muted uppercase mt-0.5">en juego</span>
        </div>
        <Fighter
          username={ch.challenged_username}
          firstName={ch.challenged_first_name}
          lastName={ch.challenged_last_name}
          avatarDisplay={ch.challenged_avatar_display}
          highlight={ch.challenged_id === currentUserId}
          isWinner={ch.status === "settled" && ch.winner_id === ch.challenged_id}
        />
      </div>

      {ch.status === "settled" &&
        ch.challenger_fixture_points != null &&
        ch.challenged_fixture_points != null && (
          <p className="text-center text-xs text-muted mt-3">
            Puntos del partido: {ch.challenger_fixture_points} – {ch.challenged_fixture_points}
          </p>
        )}

      {canRespond && (
        <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
          {!hasBet && (
            <p className="text-xs text-warning text-center">Primero haz tu pronostico en este partido para aceptar.</p>
          )}
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              size="sm"
              disabled={!hasBet}
              loading={acceptPending}
              onClick={onAccept}
            >
              Aceptar duelo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={rejectPending}
              onClick={onReject}
            >
              Rechazar
            </Button>
          </div>
        </div>
      )}
    </MotionSafe>
  );
}
