import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <h1 className="font-display text-6xl text-accent">404</h1>
      <p className="text-muted mt-2 mb-6">Pagina no encontrada</p>
      <Link href="/dashboard" className="px-4 py-2 rounded-xl bg-accent text-background font-bold">
        Volver al inicio
      </Link>
    </div>
  );
}
