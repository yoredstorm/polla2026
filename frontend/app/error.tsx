"use client";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AuthPageEnter } from "@/components/ui/AuthPageEnter";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background bg-ambient-mesh">
      <AuthPageEnter className="text-center max-w-md">
        <h1 className="font-display text-4xl text-accent mb-2">Algo salio mal</h1>
        <p className="text-muted mb-6">Ocurrio un error inesperado.</p>
        <div className="flex gap-3 justify-center">
          <Button type="button" onClick={reset}>
            Reintentar
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="secondary">
              Ir al inicio
            </Button>
          </Link>
        </div>
      </AuthPageEnter>
    </div>
  );
}
