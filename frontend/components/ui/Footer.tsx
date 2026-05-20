import Link from "next/link";
import { cn } from "@/lib/utils";

const footerLinks = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/fixtures", label: "Partidos" },
  { href: "/my-bets", label: "Mis apuestas" },
  { href: "/leaderboard", label: "Ranking" },
  { href: "/winners", label: "Ganadores" },
] as const;

// Agregamos las opciones de descarga
const downloadLinks = [
  { href: "/pdfs/reglamento.pdf", label: "Reglamento oficial", type: "pdf" },
  { href: "/pdfs/presentacion.pdf", label: "Presentación", type: "pdf" },
  // { href: "/docs/presentacion.pdf", label: "Presentación", type: "pdf" },
  // { href: "/videos/tutorial.mp4", label: "Video tutorial", type: "video" },
] as const;

// --- ICONOS ---
function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("inline-block shrink-0", className)} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 4.5l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 15.8l-4.4 2.2.8-4.9-3.5-3.4 4.9-.7L12 4.5z" fill="currentColor" opacity="0.35" />
      <path d="M12 4.5v7.3M7.6 7.2l4.4 4.6M16.4 7.2l-4.4 4.6M5.1 12h13.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon({ type, className }: { type: "pdf" | "video", className?: string }) {
  if (type === "video") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14v-4z" />
        <rect x="3" y="6" width="12" height="12" rx="2" ry="2" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className=" mt-auto border-t border-white/10 bg-surface/40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-12">
        {/* Cambiamos a grid de 12 columnas para mejor control en desktop y tablet */}
        <div className="flex flex-col gap-10 md:grid md:grid-cols-12 md:gap-8 lg:gap-12 md:items-start">
          
          {/* Columna 1: Branding (ocupa 6 columnas en desktop, 12 en tablet) */}
          <div className="md:col-span-12 lg:col-span-6">
            <p className="font-display text-2xl text-accent text-glow-accent tracking-wide">
              POLLA MUNDIALISTA
            </p>
            <p className="mt-2 text-sm text-muted max-w-sm leading-relaxed">
              Pronósticos, rankings y competencia para el Mundial 2026. Tu hub de apuestas entre amigos.
            </p>
          </div>

          {/* Columna 2: Enlaces Rápidos (ocupa 3 columnas en desktop, 6 en tablet) */}
          <div className="md:col-span-6 lg:col-span-3">
            <p className="text-xs uppercase tracking-widest text-muted mb-4">Enlaces rápidos</p>
            <nav aria-label="Enlaces del sitio" className="flex flex-col gap-3">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted hover:text-accent transition-colors duration-200 cursor-pointer focus-ring rounded-md w-fit"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Columna 3: Descargas (ocupa 3 columnas en desktop, 6 en tablet) */}
          <div className="md:col-span-6 lg:col-span-3">
            <p className="text-xs uppercase tracking-widest text-muted mb-4">Recursos</p>
            <nav aria-label="Descargas" className="flex flex-col gap-2.5">
              {downloadLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target="_blank" // Abre el archivo en una nueva pestaña
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 px-3 py-2 text-sm text-muted bg-white/5 hover:bg-white/10 hover:text-accent border border-white/5 hover:border-white/20 rounded-lg transition-all duration-300 w-full sm:w-fit md:w-full"
                >
                  <FileIcon 
                    type={link.type} 
                    className="w-4 h-4 text-white/40 group-hover:text-accent transition-colors" 
                  />
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>

        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-center space-y-2">
          <p className="text-sm text-muted">
            &copy; 2026 Polla Mundialista. Todos los derechos reservados.
          </p>
          <p className="text-sm text-muted flex items-center justify-center gap-1.5 flex-wrap">
            <span>Hecho con</span>
            <SoccerBallIcon className="w-4 h-4 text-accent drop-shadow-[0_0_6px_rgba(0,255,136,0.5)]" />
            <span>para los amantes del fútbol</span>
          </p>
        </div>
      </div>
    </footer>
  );
}