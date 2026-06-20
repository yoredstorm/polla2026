"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AuthPageEnter } from "@/components/ui/AuthPageEnter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background bg-ambient-mesh">
      <AuthPageEnter className="text-center">
        <h1 className="font-display text-6xl text-accent">404</h1>
        <p className="text-muted mt-2 mb-6">Pagina no encontrada</p>
        <Link href="/dashboard">
          <Button type="button">Volver al inicio</Button>
        </Link>
      </AuthPageEnter>
    </div>
  );
}
