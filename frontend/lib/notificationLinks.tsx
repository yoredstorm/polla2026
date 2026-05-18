import type { Notification, NotificationPayload } from "@/types/api";

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
    case "challenge_pending":
    case "challenge_accepted":
    case "challenge_settled":
      return "/my-bets?tab=retos";
    case "comment_mention":
      return p.fixture_id ? `/fixtures/${p.fixture_id}#comentarios` : null;
    default:
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
    case "challenge_pending":
    case "challenge_accepted":
    case "challenge_settled":
      return "Mis retos";
    case "comment_mention":
      return "Ver comentario";
    default:
      return "Ver detalle";
  }
}
