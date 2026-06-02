"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface HelpTourBannerProps {
  visible: boolean;
  onStart: () => void;
  onDismiss: () => void;
}

export function HelpTourBanner({ visible, onStart, onDismiss }: HelpTourBannerProps) {
  if (!visible) return null;

  return (
    <Card className="mb-6 p-4 border-accent/30 bg-accent/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p className="font-display text-lg text-white">¿Quieres un recorrido rápido?</p>
        <p className="text-sm text-muted mt-1">
          Te mostramos las secciones principales del sistema en menos de un minuto.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Omitir
        </Button>
        <Button variant="primary" size="sm" onClick={onStart}>
          Iniciar guía
        </Button>
      </div>
    </Card>
  );
}
