"use client";
import Link from "next/link";
import type { Notification } from "@/types/api";
import { notificationHref, notificationLinkLabel } from "@/lib/notificationLinks";
import {
  NotificationAdminActions,
  isAdminActionableNotification,
} from "@/components/features/notifications/NotificationAdminActions";
import { cn } from "@/lib/utils";

function formatTime(iso: string, compact?: boolean) {
  if (compact) {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return new Date(iso).toLocaleString("es-PE");
}

export interface NotificationItemProps {
  notification: Notification;
  isAdmin: boolean;
  onRead: () => void;
  onRejectClick?: (n: Notification) => void;
  layout?: "page" | "bell";
  onNavigate?: () => void;
}

export function NotificationItem({
  notification: n,
  isAdmin,
  onRead,
  onRejectClick,
  layout = "page",
  onNavigate,
}: NotificationItemProps) {
  const p = n.payload ?? {};
  const href = notificationHref(n);
  const label = notificationLinkLabel(n);
  const isAdminActionable = isAdminActionableNotification(n, isAdmin);
  const compact = layout === "bell";

  const handleLinkClick = () => {
    if (!n.read_at) onRead();
    onNavigate?.();
  };

  const content = (
    <>
      <div className={cn("flex items-start justify-between gap-2", compact && "")}>
        <p className={cn("font-medium text-white", compact ? "text-sm leading-snug" : "")}>
          {n.title}
        </p>
        {!n.read_at && compact && (
          <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
        )}
      </div>
      <p className={cn("text-muted", compact ? "text-xs leading-relaxed" : "text-sm")}>{n.body}</p>
      <p className={cn("text-muted/60", compact ? "text-[10px] text-muted/70" : "text-xs")}>
        {formatTime(n.created_at, compact)}
      </p>

      <NotificationAdminActions
        notification={n}
        payload={p}
        isAdmin={isAdmin}
        layout={layout === "page" ? "stack" : "compact"}
        onRejectClick={onRejectClick}
      />

      <div className={cn("flex flex-wrap gap-3", compact ? "pt-0" : "pt-1")}>
        {href && (
          <Link
            href={href}
            onClick={handleLinkClick}
            className="text-xs text-accent hover:underline font-medium"
          >
            {label} →
          </Link>
        )}
        {!isAdminActionable && !n.read_at && (
          <button
            type="button"
            onClick={onRead}
            className="text-xs text-muted hover:text-white"
          >
            Marcar leida
          </button>
        )}
      </div>
    </>
  );

  if (layout === "bell") {
    return (
      <li className={cn("px-4 py-3 space-y-2", !n.read_at && "bg-accent/5")}>{content}</li>
    );
  }

  return (
    <li
      className={cn(
        "rounded-xl border p-4 space-y-2",
        n.read_at ? "border-white/10 bg-glass opacity-70" : "border-accent/30 bg-accent/5",
      )}
    >
      {content}
    </li>
  );
}
