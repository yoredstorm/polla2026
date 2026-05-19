import Link from "next/link";
import { cn } from "@/lib/utils";

const footerLinks = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/fixtures", label: "Partidos" },
  { href: "/my-bets", label: "Mis apuestas" },
  { href: "/leaderboard", label: "Ranking" },
  { href: "/winners", label: "Ganadores" },
] as const;

function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn("inline-block shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 4.5l2.2 4.5 4.9.7-3.5 3.4.8 4.9L12 15.8l-4.4 2.2.8-4.9-3.5-3.4 4.9-.7L12 4.5z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M12 4.5v7.3M7.6 7.2l4.4 4.6M16.4 7.2l-4.4 4.6M5.1 12h13.8"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="relative z-[1] mt-auto border-t border-white/10 bg-surface/40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-12">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:gap-12 md:items-start">
          <div>
            <p className="font-display text-2xl text-accent text-glow-accent tracking-wide">
              POLLA MUNDIALISTA
            </p>
            <p className="mt-2 text-sm text-muted max-w-sm leading-relaxed">
              Pronosticos, rankings y competencia para el Mundial 2026. Tu hub de apuestas entre amigos.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-muted mb-4">Enlaces rapidos</p>
            <nav aria-label="Enlaces del sitio" className="flex flex-wrap gap-x-6 gap-y-3">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted hover:text-accent transition-colors duration-200 cursor-pointer focus-ring rounded-md"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-white/10 text-center space-y-2">
          <p className="text-sm text-muted">
            &copy; 2026 Polla Mundialista. Todos los derechos reservados.
          </p>
          <p className="text-sm text-muted flex items-center justify-center gap-1.5 flex-wrap">
            <span>Hecho con</span>
            <SoccerBallIcon className="w-4 h-4 text-accent drop-shadow-[0_0_6px_rgba(0,255,136,0.5)]" />
            <span>para los amantes del futbol</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

