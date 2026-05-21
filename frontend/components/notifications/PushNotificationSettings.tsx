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
    enableFromClick,
    disable,
    sendTest,
    resetAndEnableFromClick,
    diagnostics,
    showDiagnostics,
    setShowDiagnostics,
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
      {vapidConfigured && diagnostics && !diagnostics.serverVapidKeyPairConsistent && (
        <p className="text-xs text-amber-300">
          Aviso servidor: VAPID_PUBLIC_KEY en Dokploy no coincide con VAPID_PRIVATE_KEY. El backend
          usa la clave derivada; revisa variables y redesplega.
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
      {permission === "default" && !error && (
        <p className="text-xs text-amber-200 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          Al activar, Edge preguntara arriba en la barra de direcciones (candado o campana). Pulsa{" "}
          <strong className="text-white">Permitir</strong> en ese aviso.
        </p>
      )}
      {permission === "denied" && (
        <p className="text-xs text-amber-300">
          Bloqueaste los permisos. Candado junto a la URL → Notificaciones → Permitir, o
          edge://settings/content/notifications
        </p>
      )}
      {!subscribed && subscriptionCount > 0 && (
        <p className="text-xs text-amber-300">
          Hay {subscriptionCount} dispositivo(s) guardados en el servidor, pero este telefono aun no esta
          activo. Pulsa Activar o Reiniciar push.
        </p>
      )}
      {subscribed && !serverRegistered && (
        <p className="text-xs text-amber-300">
          El navegador tiene permiso pero el servidor no guardo la suscripcion. Pulsa Activar de nuevo.
        </p>
      )}
      {error && (
        <div className="space-y-2">
          <p className="text-xs text-red-300">{error}</p>
          <details className="text-xs text-muted rounded-lg border border-white/10 p-3 bg-black/20">
            <summary className="cursor-pointer text-white/90 font-medium">
              ¿Que esta pasando? (explicacion simple)
            </summary>
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              <li>
                <strong className="text-white">Tu telefono</strong> pide permiso → OK (por eso no es
                un bloqueo del sitio).
              </li>
              <li>
                <strong className="text-white">Nuestro servidor</strong> entrega la clave VAPID → si
                abajo dice «Servidor VAPID: OK», esta parte va bien.
              </li>
              <li>
                <strong className="text-white">Chrome habla con Google (FCM)</strong> para registrar el
                aparato → <span className="text-red-300">aqui falla</span> (mensaje «push service error»).
                La app aun no guarda tu dispositivo.
              </li>
            </ol>
            <p className="mt-2">
              No es un fallo de la polla en la base de datos: es el canal Google del movil. Suele
              arreglarse reseteando Chrome, quitando DNS privado/adblock o probando otro telefono/red.
            </p>
          </details>
          <button
            type="button"
            onClick={() => setShowDiagnostics((v) => !v)}
            className="text-xs text-accent underline underline-offset-2"
          >
            {showDiagnostics ? "Ocultar diagnostico tecnico" : "Ver diagnostico tecnico (para soporte)"}
          </button>
          {showDiagnostics && diagnostics && (
            <pre className="text-[10px] leading-relaxed text-muted/90 bg-black/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>
      )}
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
            onClick={enableFromClick}
            disabled={loading || permission === "denied"}
            className="text-xs px-4 py-2 rounded-lg bg-accent text-background font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Sincronizando..." : "Volver a activar"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={enableFromClick}
              disabled={loading || permission === "denied"}
              className="text-xs px-4 py-2 rounded-lg bg-accent text-background font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Activando..." : "Activar notificaciones"}
            </button>
            {(error || subscriptionCount > 0) && (
              <button
                type="button"
                onClick={resetAndEnableFromClick}
                disabled={loading || permission === "denied"}
                className="text-xs px-3 py-2 rounded-lg border border-amber-400/50 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
              >
                {loading ? "Reiniciando..." : "Reiniciar push en este dispositivo"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
