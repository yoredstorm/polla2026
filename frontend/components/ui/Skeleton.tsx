import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/10", className)} />;
}

export function MatchCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-glass p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <div className="flex justify-between gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}
