"use client";

export function PollaBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-background text-[10px] font-bold">
      {count > 99 ? "99+" : count}
    </span>
  );
}
