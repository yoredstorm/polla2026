import type { Notification, NotificationPayload } from "@/types/api";

const CHALLENGE_TYPES = new Set([
  "challenge_pending",
  "challenge_accepted",
  "challenge_settled",
  "challenge_received",
  "challenge_resolved",
]);

export function notificationHref(n: Notification): string | null {
  const p: NotificationPayload = n.payload ?? {};
  switch (n.type) {
    case "fixture_finished":
      return p.fixture_id ? `/fixtures/${p.fixture_id}` : "/fixtures#culminados";
    case "change_request_resolved":
    case "change_request_expired":
      return "/my-bets?tab=pronosticos";
    case "change_request_expired_batch":
      return "/admin/requests";
    case "badge_earned":
      return "/dashboard#medallas";
    case "social_follow":
      return p.username ? `/u/${p.username}` : p.user_id ? `/u/${p.user_id}` : null;
    case "following_bet":
      return p.fixture_id ? `/fixtures/${p.fixture_id}` : p.user_id ? `/u/${p.user_id}` : null;
    case "entry_confirmed":
    case "extra_confirmed":
      return "/my-bets";
    case "password_reset_pending":
      return "/admin/requests?tab=passwords";
    case "password_reset_resolved":
      return "/login";
    case "comment_mention":
      return p.fixture_id ? `/fixtures/${p.fixture_id}#comentarios` : null;
    default:
      if (CHALLENGE_TYPES.has(n.type)) {
        return "/my-bets?tab=retos";
      }
      if (p.fixture_id) return `/fixtures/${p.fixture_id}`;
      return null;
  }
}

export function notificationLinkLabel(n: Notification): string {
  switch (n.type) {
    case "fixture_finished":
      return "Ver partido";
    case "badge_earned":
      return "Ver medallas";
    case "change_request_resolved":
    case "change_request_expired":
      return "Mis apuestas";
    case "social_follow":
      return "Ver perfil";
    case "following_bet":
      return "Ver partido";
    case "entry_confirmed":
    case "extra_confirmed":
      return "Mis apuestas";
    case "password_reset_pending":
      return "Solicitudes admin";
    case "password_reset_resolved":
      return "Iniciar sesión";
    case "comment_mention":
      return "Ver comentario";
    default:
      if (CHALLENGE_TYPES.has(n.type)) {
        return "Mis retos";
      }
      return "Ver detalle";
  }
}
