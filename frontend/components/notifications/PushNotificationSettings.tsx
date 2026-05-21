"use client";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

export function PushNotificationSettings({ className }: { className?: string }) {
  const { user } = useAuth();
  const {
    supported,
    permission,
    subscribed,
    serverRegistered,
    vapidConfigured,
    subscriptionCount,
    loading,
    error,
    testMessage,
    enable,
    disable,
    sendTest,
  } = usePushNotifications();

  if (!supported) {
    return (
      <div
        className={cn(
          "rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-muted",
          className,
        )}
      >
        Las notificaciones del sistema requieren HTTPS y un navegador compatible (Chrome en
        Android o escritorio). En iPhone aun no esta disponible en esta version.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 space-y-2",
        className,
      )}
    >
      <p className="text-sm font-medium text-white">Notificaciones en este dispositivo</p>
      <p className="text-xs text-muted">
        Recibe avisos aunque la app este cerrada: partidos, retos, menciones y pendientes de
        admin. Al iniciar sesion te pedimos permiso una vez; tambien puedes activarlo aqui.
      </p>
      {!vapidConfigured && (
        <p className="text-xs text-red-300">
          El servidor de produccion no tiene claves VAPID. Un administrador debe configurarlas en
          Dokploy (backend) y volver a desplegar.
        </p>
      )}
      {vapidConfigured && serverRegistered && (
        <p className="text-xs text-muted">
          Servidor: {subscriptionCount} dispositivo{subscriptionCount === 1 ? "" : "s"} registrado
          {subscriptionCount === 1 ? "" : "s"}.
        </p>
      )}
      <p className="text-xs text-muted border-t border-white/10 pt-2 mt-1">
        {user?.is_admin ? (
          <>
            <strong className="text-white">Importante:</strong> extras impagos, solicitudes de
            cambio y registros nuevos avisan a los administradores. Si tu mismo creas el extra, no
            te llega aviso (es para otros admins). Prueba con otra cuenta o pulsa Enviar prueba con
            la app cerrada.
          </>
        ) : (
          <>
            Las peticiones de cambio o pago las revisan los administradores; el aviso push les llega
            a ellos, no a quien envia la peticion. Tu recibes push por partidos, retos, menciones y
            cuando aprueban algo tuyo.
          </>
        )}
      </p>
      {permission === "denied" && (
        <p className="text-xs text-amber-300">
          Bloqueaste los permisos. Activalos en la configuracion del navegador para este sitio.
        </p>
      )}
      {subscribed && !serverRegistered && (
        <p className="text-xs text-amber-300">
          El navegador tiene permiso pero el servidor no guardo la suscripcion. Pulsa Activar de nuevo.
        </p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {testMessage && <p className="text-xs text-emerald-300">{testMessage}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {subscribed && serverRegistered ? (
          <>
            <span className="text-xs text-emerald-300 self-center">Activadas en este dispositivo</span>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              Enviar prueba
            </button>
            <button
              type="button"
              onClick={() => void disable()}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-muted hover:text-white disabled:opacity-50"
            >
              Desactivar
            </button>
          </>
        ) : subscribed && !serverRegistered ? (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={loading || permission === "denied"}
            className="text-xs px-4 py-2 rounded-lg bg-accent text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Sincronizando..." : "Volver a activar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void enable()}
            disabled={loading || permission === "denied"}
            className="text-xs px-4 py-2 rounded-lg bg-accent text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Activando..." : "Activar notificaciones"}
          </button>
        )}
      </div>
    </div>
  );
}
