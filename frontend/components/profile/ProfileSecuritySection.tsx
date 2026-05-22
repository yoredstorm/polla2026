"use client";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import api from "@/lib/api";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PushNotificationSettings } from "@/components/notifications/PushNotificationSettings";

interface SecurityEvent {
  id: string;
  action: string;
  action_label: string;
  summary: string;
  created_at: string;
  ip_address: string | null;
}

export function ProfileSecuritySection() {
  const { data } = useQuery({
    queryKey: ["me", "security-events"],
    queryFn: () => api.get<{ data: SecurityEvent[] }>("/users/me/security-events"),
    staleTime: 60_000,
  });
  const push = usePushNotifications();
  const events = data?.data ?? [];

  return (
    <div className="rounded-xl border border-white/10 bg-glass p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-accent" aria-hidden />
        <h3 className="font-display text-lg text-white">Seguridad y actividad</h3>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Push en este dispositivo</p>
          <p className="text-white mt-1">
            {push.permission === "granted" && push.serverRegistered
              ? "Activo"
              : push.permission === "denied"
                ? "Bloqueado en el navegador"
                : "No activado"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted">Dispositivos registrados</p>
          <p className="text-white mt-1">{push.subscriptionCount ?? 0}</p>
        </div>
      </div>

      <PushNotificationSettings showCategoryPrefs />

      <div>
        <p className="text-xs text-muted mb-2 uppercase tracking-wide">Eventos recientes de tu cuenta</p>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Sin eventos de seguridad registrados aun.</p>
        ) : (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {events.map((ev) => (
              <li key={ev.id} className="text-sm border-b border-white/5 pb-2 last:border-0">
                <div className="flex justify-between gap-2 text-[10px] text-muted uppercase">
                  <span>{ev.action_label}</span>
                  <time dateTime={ev.created_at}>
                    {new Date(ev.created_at).toLocaleString("es-PE", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="text-muted mt-0.5">{ev.summary}</p>
                {ev.ip_address && (
                  <p className="text-[10px] text-white/40 mt-0.5">IP: {ev.ip_address}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
