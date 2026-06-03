"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminMarquee, useUpdateMarquee } from "@/hooks/useAdmin";
import { PromoMarquee } from "@/components/features/site/PromoMarquee";
import { toPublicMarqueeView } from "@/hooks/useSiteMarquee";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/apiError";

const MAX_LENGTH = 280;

export default function AdminMarqueePage() {
  const { data, isLoading, isError, refetch } = useAdminMarquee();
  const updateMarquee = useUpdateMarquee();
  const toast = useToast((s) => s.add);

  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (data) {
      setMessage(data.message ?? "");
      setEnabled(data.enabled ?? false);
    }
  }, [data]);

  const trimmed = message.trim();
  const overLimit = message.length > MAX_LENGTH;
  const showEmptyWarning = enabled && !trimmed;

  const dirty = useMemo(() => {
    if (!data) return false;
    return (data.message ?? "") !== message || (data.enabled ?? false) !== enabled;
  }, [data, message, enabled]);

  const savedLive = data ? toPublicMarqueeView(data) : null;

  async function handleSave(nextEnabled = enabled) {
    if (overLimit) {
      toast("El mensaje no puede superar 280 caracteres", "error");
      return;
    }
    try {
      const result = await updateMarquee.mutateAsync({
        message,
        enabled: nextEnabled,
      });
      setEnabled(result.enabled);
      setMessage(result.message ?? "");
      toast(
        result.enabled && result.message.trim()
          ? "Marquesina activada en la web"
          : "Marquesina desactivada en la web",
        "success",
      );
    } catch (err) {
      toast(parseApiError(err)?.message ?? "No se pudo guardar la marquesina", "error");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-white">Marquesina promocional</h1>
        <p className="text-muted animate-pulse">Cargando configuracion...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl text-white">Marquesina promocional</h1>
        <Card className="p-6 text-center border-destructive/30 bg-destructive/5">
          <p className="text-destructive font-medium">No se pudo cargar la configuracion</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => refetch()}>
            Reintentar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-white">Marquesina promocional</h1>
          <p className="text-muted text-sm mt-2 max-w-2xl">
            El interruptor solo prepara el cambio. Debes pulsar{" "}
            <strong className="text-white font-medium">Guardar cambios</strong> para que se aplique
            en la web.
          </p>
        </div>
        {savedLive && (
          <span
            className={cn(
              "shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border",
              savedLive.enabled
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-white/5 border-white/15 text-muted",
            )}
          >
            En la web: {savedLive.enabled ? "Visible" : "Oculta"}
          </span>
        )}
      </div>

      {dirty && (
        <div
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90"
          role="status"
        >
          Tienes cambios sin guardar. Pulsa Guardar para que los usuarios los vean (o no vean) la
          marquesina.
        </div>
      )}

      <Card className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-white font-medium">Activar marquesina</p>
            <p className="text-xs text-muted mt-1">
              Apagado = no se muestra a nadie, aunque el texto siga guardado.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Activar marquesina"
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              "relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border transition-colors",
              enabled ? "bg-accent/30 border-accent/50" : "bg-white/10 border-white/20",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform mt-0.5",
                enabled ? "translate-x-7 ml-0.5" : "translate-x-1",
              )}
            />
          </button>
        </div>

        <div>
          <label htmlFor="marquee-message" className="block text-sm font-medium text-white mb-2">
            Mensaje promocional
          </label>
          <textarea
            id="marquee-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={MAX_LENGTH + 20}
            placeholder="Ej: Doble puntos en la jornada 3 · Inscribete antes del viernes..."
            className={cn(
              "w-full rounded-xl border bg-white/5 px-4 py-3 text-sm text-white placeholder:text-muted/50",
              "focus:outline-none focus:ring-2 focus:ring-accent/40",
              overLimit ? "border-destructive/50" : "border-white/10",
            )}
          />
          <div className="flex justify-between mt-1.5 text-xs">
            <span className={cn(overLimit ? "text-destructive" : "text-muted")}>
              {message.length}/{MAX_LENGTH}
            </span>
            {showEmptyWarning && (
              <span className="text-amber-300">
                Activa pero sin texto: no se mostrara en la web
              </span>
            )}
          </div>
        </div>

        {data?.updated_at && (
          <p className="text-xs text-muted">
            Ultima actualizacion guardada:{" "}
            {new Date(data.updated_at).toLocaleString("es-ES")}
            {data.updated_by_username ? ` · @${data.updated_by_username}` : ""}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            onClick={() => handleSave()}
            loading={updateMarquee.isPending}
            disabled={overLimit}
          >
            Guardar cambios
          </Button>
          {(enabled || savedLive?.enabled) && (
            <Button
              type="button"
              variant="secondary"
              loading={updateMarquee.isPending}
              disabled={overLimit}
              onClick={() => {
                setEnabled(false);
                void handleSave(false);
              }}
            >
              Desactivar en la web
            </Button>
          )}
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="font-display text-lg text-white">Vista previa</h2>
        <p className="text-xs text-muted">
          Muestra como quedaria al guardar (interruptor + texto).
        </p>
        <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0c10]">
          <PromoMarquee preview={{ enabled, message: trimmed }} embedded />
          {(!enabled || !trimmed) && (
            <div className="px-4 py-8 text-center text-sm text-muted bg-white/[0.02]">
              La marquesina no se mostraria en la web con esta configuracion.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
