/**
 * Textos de ayuda contextual (tooltips y tour).
 * Sincronizar con docs/GUIA_SISTEMA.md al cambiar rutas, reglas o flujos.
 */

export type HelpEntry = {
  short: string;
  detail?: string;
};

export const HELP_CONTENT = {
  // Navegación
  "nav.dashboard": {
    short: "Resumen de tu polla: pozo, próximo partido, estadísticas y ranking parcial.",
    detail: "Desde Inicio ves el estado general de la competencia y accesos rápidos a apostar.",
  },
  "nav.fixtures": {
    short: "Lista de partidos con filtros por grupo y estado (programados, en vivo, finalizados).",
    detail: "Entra a cada partido para pronosticar, ver tendencias, retos y comentarios.",
  },
  "nav.myBets": {
    short: "Historial de tus pronósticos y retos 1v1; aquí puedes pedir cambios de apuesta.",
    detail: "Pestaña pronósticos: apuestas gratuitas y extras. Pestaña retos: duelos pendientes y resueltos.",
  },
  "nav.leaderboard": {
    short: "Ranking global o semanal; ordena por puntos, % de acierto o cantidad de apuestas.",
    detail: "Los puntos se actualizan cuando el admin marca un partido como finalizado.",
  },
  "nav.notifications": {
    short: "Historial de avisos: retos, solicitudes resueltas, menciones y más.",
    detail: "La campana en la barra muestra no leídas; también recibes avisos en tiempo real.",
  },

  // Páginas — dashboard
  "page.dashboard": {
    short: "Tu centro de control: pozo, partidos, puntuación y actividad de la polla.",
  },
  "page.dashboard.stats": {
    short: "Tu puesto, puntos totales y cuánto te falta para alcanzar al líder del ranking.",
  },
  "page.dashboard.nextMatch": {
    short: "El encuentro más próximo; entra para enviar o revisar tu pronóstico antes del cierre.",
  },
  "page.dashboard.upcoming": {
    short: "Partidos programados; abre uno para apostar o ver detalles del encuentro.",
  },
  "page.dashboard.scoring": {
    short: "2 pts marcador exacto, 1 pt solo ganador correcto, 0 si fallas. Se calcula al finalizar el partido.",
  },
  "page.dashboard.prizePool": {
    short: "Dinero acumulado del torneo (cuotas y extras confirmados). Premios: 60 % / 30 % / 10 % al top 3.",
  },
  "page.dashboard.topBettors": {
    short: "Vista rápida del ranking; el listado completo está en la sección Ranking.",
  },
  "page.dashboard.progress": {
    short: "Avance por partidos y hitos: grupos, 16vos, 8vos, cuartos, semifinal, 3er puesto y final.",
    detail:
      "Cada línea vertical marca el cierre de una fase y su ganador (7 en total). Los puntos y el pozo se reinician; hay que pagar de nuevo para el siguiente hito.",
  },

  // Páginas — fixtures
  "page.fixtures": {
    short: "Todos los partidos de la polla; filtra por estado o grupo para encontrar encuentros.",
  },
  "page.fixtures.filters": {
    short: "Programados: aún puedes apostar. En vivo: partido en curso. Finalizados: con resultado y puntos.",
  },

  // Detalle partido
  "page.fixtureDetail": {
    short: "Apostar, ver tendencias, retar a otro jugador y comentar en este encuentro.",
  },
  "page.fixtureDetail.bet": {
    short: "Un pronóstico gratuito por partido. Puedes agregar un extra (otro marcador) con pago confirmado por admin.",
    detail: "Las apuestas cierran 1 minuto antes del inicio. Cambios solo vía solicitud (hasta 1 h antes).",
  },
  "page.fixtureDetail.challenge": {
    short: "Reto 1v1: apuestas puntos de ranking contra otro jugador que ya pronosticó este partido.",
    detail: "Al finalizar el partido se comparan puntos del marcador; gana el duelo quien sume más.",
  },
  "page.fixtureDetail.comments": {
    short: "Comentarios del partido; puedes mencionar a otros con @usuario.",
  },

  // Mis apuestas
  "page.myBets": {
    short: "Tus pronósticos y retos en un solo lugar.",
  },
  "page.myBets.predictions": {
    short: "Apuestas gratuitas y extras; solicita cambio si necesitas corregir (ventana de 1 h antes del partido).",
  },
  "page.myBets.challenges": {
    short: "Duelos 1v1 enviados, recibidos y su estado (pendiente, aceptado, liquidado).",
  },

  // Ranking
  "page.leaderboard": {
    short: "Clasificación de jugadores por puntos acumulados en la polla activa.",
  },
  "page.leaderboard.period": {
    short: "Global: todo el torneo. Semanal: solo la semana en curso.",
  },
  "page.leaderboard.sort": {
    short: "Ordena por puntos totales, porcentaje de aciertos o cantidad de apuestas realizadas.",
  },

  // Notificaciones
  "page.notifications": {
    short: "Todos tus avisos: retos, cambios de apuesta, menciones y confirmaciones.",
    detail: "Los admins también ven aquí entradas pendientes y extras por confirmar.",
  },

  // Perfil
  "page.profile": {
    short: "Avatar, nombre visible, privacidad de apuestas y preferencias de la cuenta.",
  },
  "page.profile.privacy": {
    short: "Público: cualquiera ve tus apuestas. Solo con código: hace falta invitación que generas aquí.",
  },
  "page.profile.amounts": {
    short: "Si ocultas montos, otros ven tus apuestas pero no cuánto pagaste en cada partido.",
  },
  "page.profile.badges": {
    short: "Medallas desbloqueadas por aciertos, retos y actividad social.",
  },

  // Perfil público
  "page.publicProfile": {
    short: "Apuestas de otro jugador según su privacidad; puedes copiar pronósticos a partidos abiertos.",
  },
  "page.publicProfile.copy": {
    short: "Copia un marcador a otro partido disponible o varias apuestas en bloque si está permitido.",
  },

  // Ganadores
  "page.winners": {
    short: "Podio de la polla activa y reparto del pozo: 1.º 60 %, 2.º 30 %, 3.º 10 %.",
  },

  // Conceptos
  "concept.pozo": {
    short: "Premio acumulado con cuotas de entrada y extras confirmados por el administrador.",
  },
  "concept.apuestaGratuita": {
    short: "Una predicción incluida por partido; no se edita libremente, solo con solicitud de cambio.",
  },
  "concept.apuestaExtra": {
    short: "Segunda predicción distinta en el mismo partido; requiere pago extra confirmado por admin.",
  },
  "concept.reto1v1": {
    short: "Duelo de puntos entre dos jugadores en un partido; el retado debe tener pronóstico para aceptar.",
  },
  "concept.solicitudCambio": {
    short: "Pedido para modificar o eliminar una apuesta; el admin aprueba o rechaza antes del partido.",
  },

  // Tour
  "tour.welcome": {
    short: "Bienvenido a Polla Deportiva",
    detail:
      "Este recorrido te muestra las secciones principales: Inicio, Partidos, Apuestas, Ranking y avisos. Puedes repetirlo cuando quieras desde el botón «Ver guía del sistema».",
  },
  "tour.prizePool": {
    short: "Pozo de premios",
    detail: "Aquí ves el dinero acumulado del torneo. Las cuotas y extras confirmados suman al pozo repartido entre el top 3.",
  },
  "tour.notifications": {
    short: "Campana de avisos",
    detail: "Recibes retos, respuestas a solicitudes de cambio y menciones. El contador indica avisos sin leer.",
  },
  "tour.finish": {
    short: "¡Listo!",
    detail:
      "Explora Partidos para pronosticar. En Perfil ajusta privacidad y avatar. Usa el icono (?) junto a títulos para más ayuda.",
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP_CONTENT;

export function getHelpText(key: HelpKey, variant: "short" | "detail" = "short"): string {
  const entry = HELP_CONTENT[key];
  const detail = "detail" in entry ? entry.detail : undefined;
  if (variant === "detail" && detail) return detail;
  return entry.short;
}

export type TourStepId =
  | "welcome"
  | "nav-dashboard"
  | "prize-pool"
  | "nav-fixtures"
  | "nav-my-bets"
  | "nav-leaderboard"
  | "notifications"
  | "finish";

export type TourStepConfig = {
  id: TourStepId;
  helpKey: HelpKey;
  /** CSS selector; omit for centered popover */
  element?: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TOUR_STEPS: TourStepConfig[] = [
  { id: "welcome", helpKey: "tour.welcome" },
  { id: "nav-dashboard", helpKey: "nav.dashboard", element: '[data-help-tour="nav-dashboard"]', side: "bottom" },
  { id: "prize-pool", helpKey: "tour.prizePool", element: '[data-help-tour="prize-pool"]', side: "left" },
  { id: "nav-fixtures", helpKey: "nav.fixtures", element: '[data-help-tour="nav-fixtures"]', side: "bottom" },
  { id: "nav-my-bets", helpKey: "nav.myBets", element: '[data-help-tour="nav-my-bets"]', side: "bottom" },
  { id: "nav-leaderboard", helpKey: "nav.leaderboard", element: '[data-help-tour="nav-leaderboard"]', side: "bottom" },
  { id: "notifications", helpKey: "tour.notifications", element: '[data-help-tour="notifications"]', side: "bottom" },
  { id: "finish", helpKey: "tour.finish" },
];

export const HELP_TOUR_STORAGE_KEY = "polla_help_tour_v1";
