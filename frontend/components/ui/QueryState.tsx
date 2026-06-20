"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty: boolean;
  onRetry?: () => void;
  loadingSlot?: ReactNode;
  emptySlot?: ReactNode;
  errorMessage?: string;
  children: ReactNode;
}

export function QueryState({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  loadingSlot,
  emptySlot,
  errorMessage = "No se pudieron cargar los datos.",
  children,
}: QueryStateProps) {
  if (isLoading) {
    return <>{loadingSlot ?? <Skeleton className="h-24 w-full" />}</>;
  }
  if (isError) {
    return (
      <div className="text-center py-12 space-y-3 rounded-xl border border-danger/30 bg-danger/5">
        <p className="text-danger text-sm">{errorMessage}</p>
        {onRetry && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }
  if (isEmpty) {
    return <>{emptySlot ?? <p className="text-center text-muted py-12">No hay resultados</p>}</>;
  }
  return <>{children}</>;
}
