"use client";
import { useFollowStatus, useFollowUser, useUnfollowUser } from "@/hooks/useSocial";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  username: string;
  className?: string;
}

export function FollowButton({ username, className }: FollowButtonProps) {
  const { data, isLoading } = useFollowStatus(username);
  const follow = useFollowUser();
  const unfollow = useUnfollowUser();

  if (isLoading || data?.is_self) return null;

  const following = data?.following ?? false;
  const pending = follow.isPending || unfollow.isPending;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => (following ? unfollow.mutate(username) : follow.mutate(username))}
      className={cn(
        "px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50",
        following
          ? "border-white/20 text-muted hover:bg-white/5"
          : "border-accent/50 text-accent hover:bg-accent/10",
        className,
      )}
    >
      {pending ? "..." : following ? "Dejar de seguir" : "Seguir"}
    </button>
  );
}
