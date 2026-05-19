import Link from "next/link";
import { cn } from "@/lib/utils";
import { fullName } from "@/lib/userDisplay";

interface UserDisplayNameProps {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
  nameClassName?: string;
  usernameClassName?: string;
  layout?: "stack" | "inline";
  linkToProfile?: boolean;
  showUsername?: boolean;
}

export function UserDisplayName({
  username,
  firstName,
  lastName,
  className,
  nameClassName,
  usernameClassName,
  layout = "stack",
  linkToProfile = false,
  showUsername = true,
}: UserDisplayNameProps) {
  const display = fullName(firstName, lastName);
  const profileHref = `/u/${encodeURIComponent(username)}`;

  const nameEl = display ? (
    <span className={cn("font-medium text-white truncate", nameClassName)}>{display}</span>
  ) : null;

  const nickEl = showUsername ? (
    <span className={cn("text-muted truncate", layout === "stack" ? "text-xs" : "text-sm", usernameClassName)}>
      @{username}
    </span>
  ) : null;

  const content =
    layout === "inline" ? (
      <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 min-w-0", className)}>
        {nameEl}
        {nameEl && nickEl ? nickEl : !nameEl ? (
          <span className={cn("font-medium text-white", usernameClassName)}>@{username}</span>
        ) : null}
      </span>
    ) : (
      <span className={cn("flex flex-col min-w-0", className)}>
        {nameEl ?? (
          <span className={cn("font-medium text-white truncate", usernameClassName)}>@{username}</span>
        )}
        {nameEl && nickEl}
      </span>
    );

  if (linkToProfile) {
    return (
      <Link href={profileHref} className="hover:text-accent transition-colors min-w-0">
        {content}
      </Link>
    );
  }

  return content;
}
