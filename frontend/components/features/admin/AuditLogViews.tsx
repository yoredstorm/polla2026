"use client";

import type { AuditEntry } from "@/hooks/useAdmin";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { cn } from "@/lib/utils";

export function formatAuditDate(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function tryFormatJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function AuditLogDetailCell({
  entry,
  expanded,
  onToggle,
}: {
  entry: AuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = entry.detail_summary?.trim();
  const hasRaw = !!entry.detail && entry.detail.length > 0;

  return (
    <div className="space-y-1">
      {summary ? (
        <p className="text-xs text-muted leading-relaxed">{summary}</p>
      ) : !hasRaw ? (
        <span className="text-muted">—</span>
      ) : null}
      {hasRaw && (
        <button type="button" onClick={onToggle} className="text-[10px] text-accent hover:underline">
          {expanded ? "Ocultar JSON" : "Ver JSON"}
        </button>
      )}
      {expanded && hasRaw && (
        <pre className="text-[10px] text-muted/90 bg-black/30 rounded-lg p-2 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap break-all">
          {tryFormatJson(entry.detail!)}
        </pre>
      )}
    </div>
  );
}

interface AuditLogViewsProps {
  logs: AuditEntry[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  actionColors: Record<string, string>;
}

export function AuditLogMobileList({
  logs,
  expandedId,
  onToggleExpand,
  actionColors,
}: AuditLogViewsProps) {
  return (
    <ul className="md:hidden space-y-3" role="list">
      {logs.map((entry) => (
        <li
          key={entry.id}
          className="rounded-xl border border-white/10 bg-glass p-4 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted">{formatAuditDate(entry.created_at)}</p>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0",
                actionColors[entry.action] ?? "bg-white/10 text-white",
              )}
            >
              {entry.action_label ?? entry.action}
            </span>
          </div>
          <p className="text-sm font-medium text-white">{entry.username ?? "Sistema"}</p>
          <AuditLogDetailCell
            entry={entry}
            expanded={expandedId === entry.id}
            onToggle={() => onToggleExpand(entry.id)}
          />
          {entry.ip_address && (
            <p className="text-[10px] text-muted">IP: {entry.ip_address}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AuditLogDesktopTable({
  logs,
  expandedId,
  onToggleExpand,
  actionColors,
}: AuditLogViewsProps) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-muted">
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Usuario</th>
            <th className="px-4 py-3 font-medium">Acción</th>
            <th className="px-4 py-3 font-medium min-w-[280px]">Detalle</th>
            <th className="px-4 py-3 font-medium">IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((entry, i) => (
            <StaggerItem
              key={entry.id}
              as="tr"
              index={Math.min(i, 12)}
              className="border-b border-white/5 hover:bg-white/5 align-top transition-[background-color,transform] duration-fast ease-entrance hover:-translate-y-px"
            >
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {formatAuditDate(entry.created_at)}
              </td>
              <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                {entry.username ?? "Sistema"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
                    actionColors[entry.action] ?? "bg-white/10 text-white",
                  )}
                >
                  {entry.action_label ?? entry.action}
                </span>
              </td>
              <td className="px-4 py-3 max-w-md">
                <AuditLogDetailCell
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => onToggleExpand(entry.id)}
                />
              </td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {entry.ip_address ?? "—"}
              </td>
            </StaggerItem>
          ))}
        </tbody>
      </table>
    </div>
  );
}
