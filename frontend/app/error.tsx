"use client";
import Link from "next/link";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <h1 className="font-display text-4xl text-accent mb-2">Algo salio mal</h1>
      <p className="text-muted mb-6 text-center">Ocurrio un error inesperado.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-accent text-background font-bold"
        >
          Reintentar
        </button>
        <Link href="/dashboard" className="px-4 py-2 rounded-xl border border-white/20 text-white">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
