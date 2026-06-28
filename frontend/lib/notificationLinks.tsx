import type { Notification, NotificationPayload } from "@/types/api";
import { DEFAULT_COMPETITION_SLUG, competitionAdminPath, competitionFixturesPath } from "@/lib/competitionPaths";

const CHALLENGE_TYPES = new Set([
  "challenge_pending",
  "challenge_accepted",
  "challenge_settled",
  "challenge_received",
  "challenge_resolved",
]);

const ADMIN_ACTIONABLE = new Set([
  "extra_bet_pending",
  "entry_pending",
  "change_request_pending",
  "password_reset_pending",
]);

export function notificationHref(n: Notification): string | null {
  const p: NotificationPayload = n.payload ?? {};
  const compSlug =
    (typeof p.competition_slug === "string" && p.competition_slug) || DEFAULT_COMPETITION_SLUG;
  if (ADMIN_ACTIONABLE.has(n.type)) {
    if (n.type === "change_request_pending") {
      return competitionAdminPath(compSlug, "requests");
    }
    if (n.type === "entry_pending" || n.type === "extra_bet_pending") {
      return competitionAdminPath(compSlug, "members");
    }
    return `/notifications?focus=${n.id}`;
  }
  switch (n.type) {
    case "fixture_finished":
    case "fixture_betting_closed":
      return p.fixture_id
        ? competitionFixturesPath(compSlug, p.fixture_id)
        : competitionFixturesPath(compSlug);
    case "fixture_betting_closed_admin":
    case "fixture_betting_soon_admin":
      return competitionAdminPath(compSlug, "fixtures");
    case "change_request_resolved":
    case "change_request_expired":
      return "/my-bets?tab=pronosticos";
    case "change_request_expired_batch":
      return competitionAdminPath(compSlug, "requests");
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
      return `/notifications?focus=${n.id}`;
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
    case "fixture_betting_closed":
      return "Ver partido";
    case "fixture_betting_closed_admin":
    case "fixture_betting_soon_admin":
      return "Gestionar partido";
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
    case "extra_bet_pending":
    case "entry_pending":
    case "change_request_pending":
      return "Gestionar en notificaciones";
    case "password_reset_pending":
      return "Gestionar en notificaciones";
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
