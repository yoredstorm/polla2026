"""Notification creation, persistence, and Redis pub/sub for WebSocket push."""
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.models.notification import Notification
from app.models.user import User
import structlog

logger = structlog.get_logger(__name__)


def notification_to_dict(n: Notification) -> dict[str, Any]:
    payload = None
    if n.payload:
        try:
            payload = json.loads(n.payload)
        except json.JSONDecodeError:
            payload = n.payload
    return {
        "id": str(n.id),
        "user_id": str(n.user_id),
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "payload": payload,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat(),
    }


async def publish_to_user(redis: aioredis.Redis, user_id: uuid.UUID, event: dict[str, Any]) -> None:
    await redis.publish(
        "notifications",
        json.dumps({"user_id": str(user_id), "event": event}, default=str),
    )


async def broadcast_event(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    event: dict[str, Any],
) -> None:
    """Push a lightweight WS event to all active users (no notification row)."""
    if not redis:
        return
    result = await db.execute(select(User.id).where(User.is_active == True))  # noqa: E712
    for (uid,) in result.all():
        await publish_to_user(redis, uid, event)


async def broadcast_polla_updated(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    group_id: uuid.UUID,
    prize_pool: Any,
    previous_prize_pool: Any,
    member_count: int,
    reason: str,
) -> None:
    from decimal import Decimal

    prev = Decimal(str(previous_prize_pool))
    curr = Decimal(str(prize_pool))
    await broadcast_event(
        db,
        redis,
        {
            "type": "polla_updated",
            "data": {
                "group_id": str(group_id),
                "prize_pool": str(curr),
                "previous_prize_pool": str(prev),
                "member_count": member_count,
                "delta": str(curr - prev),
                "reason": reason,
            },
        },
    )


async def broadcast_competition_marquee_updated(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    competition_slug: str,
) -> None:
    """Notify connected clients to refetch a competition promo marquee."""
    await broadcast_event(
        db,
        redis,
        {
            "type": "competition_marquee_updated",
            "data": {"competition_slug": competition_slug},
        },
    )


async def broadcast_site_marquee_updated(
    db: AsyncSession,
    redis: aioredis.Redis | None,
) -> None:
    """Deprecated — kept for backward compatibility with older clients."""
    await broadcast_event(
        db,
        redis,
        {"type": "site_marquee_updated", "data": {}},
    )


async def broadcast_fixture_updated(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    fixture_id: uuid.UUID,
    status: str,
    home_score: int | None,
    away_score: int | None,
    home_team: str,
    away_team: str,
) -> None:
    await broadcast_event(
        db,
        redis,
        {
            "type": "fixture_updated",
            "data": {
                "fixture_id": str(fixture_id),
                "status": status,
                "home_score": home_score,
                "away_score": away_score,
                "home_team": home_team,
                "away_team": away_team,
            },
        },
    )


async def broadcast_goal_scored(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    fixture_id: uuid.UUID,
    team: str,
    scoring_team_name: str,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
    previous_home_score: int,
    previous_away_score: int,
    minute: int | None,
    recorded_at: str,
) -> None:
    await broadcast_event(
        db,
        redis,
        {
            "type": "goal_scored",
            "data": {
                "fixture_id": str(fixture_id),
                "team": team,
                "scoring_team_name": scoring_team_name,
                "home_team": home_team,
                "away_team": away_team,
                "home_score": home_score,
                "away_score": away_score,
                "previous_home_score": previous_home_score,
                "previous_away_score": previous_away_score,
                "minute": minute,
                "recorded_at": recorded_at,
            },
        },
    )


async def broadcast_fixture_cheer(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    fixture_id: uuid.UUID,
    team: Literal["home", "away"],
    home_team: str,
    away_team: str,
) -> None:
    await broadcast_event(
        db,
        redis,
        {
            "type": "fixture_cheer",
            "data": {
                "fixture_id": str(fixture_id),
                "team": team,
                "home_team": home_team,
                "away_team": away_team,
            },
        },
    )


async def create_notification(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    user_id: uuid.UUID,
    type: str,
    title: str,
    body: str,
    payload: dict[str, Any] | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        payload=json.dumps(payload, default=str) if payload else None,
    )
    db.add(n)
    await db.flush()
    await db.refresh(n)

    if redis:
        await publish_to_user(
            redis,
            user_id,
            {"type": "notification", "data": notification_to_dict(n)},
        )
        unread = await get_unread_count(db, user_id)
        await publish_to_user(redis, user_id, {"type": "unread_count", "count": unread})

    push_sent = 0
    try:
        from app.services.push_service import send_web_push_for_notification, vapid_configured

        if not vapid_configured():
            logger.warning(
                "web_push_skipped_vapid_not_configured",
                user_id=str(user_id),
                notification_id=str(n.id),
                type=type,
            )
        else:
            push_sent, push_error = await send_web_push_for_notification(db, n)
            if push_sent == 0:
                logger.warning(
                    "web_push_not_delivered",
                    user_id=str(user_id),
                    notification_id=str(n.id),
                    type=type,
                    error=push_error,
                )
            setattr(n, "push_last_error", push_error)
    except Exception:
        logger.exception("web_push_after_notification_failed", notification_id=str(n.id))

    setattr(n, "push_sent", push_sent)
    return n


async def notify_admins(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    type: str,
    title: str,
    body: str,
    payload: dict[str, Any] | None = None,
    exclude_user_id: uuid.UUID | None = None,
    competition_id: uuid.UUID | None = None,
) -> list[Notification]:
    admin_ids: set[uuid.UUID] = set(
        row[0]
        for row in (
            await db.execute(select(User.id).where(User.is_admin == True, User.is_active == True))  # noqa: E712
        ).all()
    )
    if competition_id is not None:
        from app.models.competition import CompetitionAdmin

        comp_rows = await db.execute(
            select(CompetitionAdmin.user_id)
            .join(User, User.id == CompetitionAdmin.user_id)
            .where(
                CompetitionAdmin.competition_id == competition_id,
                User.is_active == True,  # noqa: E712
            )
        )
        admin_ids.update(row[0] for row in comp_rows.all())
    admin_id_list = list(admin_ids)
    if exclude_user_id is not None and len(admin_id_list) > 1:
        admin_id_list = [aid for aid in admin_id_list if aid != exclude_user_id]
    if not admin_id_list:
        logger.warning(
            "notify_admins_no_recipients",
            type=type,
            exclude_user_id=str(exclude_user_id) if exclude_user_id else None,
        )
        return []
    created: list[Notification] = []
    for admin_id in admin_id_list:
        n = await create_notification(
            db, redis, user_id=admin_id, type=type, title=title, body=body, payload=payload,
        )
        created.append(n)
    logger.info(
        "notify_admins_sent",
        type=type,
        admin_count=len(admin_id_list),
        notification_count=len(created),
        competition_id=str(competition_id) if competition_id else None,
    )
    return created


async def notify_followers_of_new_bet(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    actor_id: uuid.UUID,
    actor_username: str,
    bet_id: uuid.UUID,
    fixture_id: uuid.UUID,
    predicted_home: int,
    predicted_away: int,
    home_team: str,
    away_team: str,
) -> list[Notification]:
    title, body, payload = build_following_bet(
        username=actor_username,
        user_id=str(actor_id),
        fixture_id=str(fixture_id),
        bet_id=str(bet_id),
        home_team=home_team,
        away_team=away_team,
        predicted_home=predicted_home,
        predicted_away=predicted_away,
    )
    return await notify_user_followers(
        db,
        redis,
        actor_id=actor_id,
        type="following_bet",
        title=title,
        body=body,
        payload=payload,
    )


async def notify_user_followers(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    actor_id: uuid.UUID,
    type: str,
    title: str,
    body: str,
    payload: dict[str, Any] | None = None,
) -> list[Notification]:
    """Notify all users who follow actor_id (followers of the actor)."""
    from app.models.social import UserFollow

    result = await db.execute(
        select(UserFollow.follower_id).where(UserFollow.following_id == actor_id)
    )
    follower_ids = [row[0] for row in result.all() if row[0] != actor_id]
    created: list[Notification] = []
    for follower_id in follower_ids:
        n = await create_notification(
            db, redis, user_id=follower_id, type=type, title=title, body=body, payload=payload,
        )
        created.append(n)
    return created


async def notify_all_active_users(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    type: str,
    title: str,
    body: str,
    payload: dict[str, Any] | None = None,
) -> list[Notification]:
    result = await db.execute(select(User.id).where(User.is_active == True))
    user_ids = [row[0] for row in result.all()]
    created: list[Notification] = []
    for uid in user_ids:
        n = await create_notification(
            db, redis, user_id=uid, type=type, title=title, body=body, payload=payload,
        )
        created.append(n)
    return created


async def get_unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    q = select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id,
        Notification.read_at == None,  # noqa: E711
    )
    return (await db.execute(q)).scalar() or 0


async def mark_read(db: AsyncSession, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification | None:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        return None
    if not n.read_at:
        n.read_at = datetime.now(timezone.utc)
        await db.flush()
    return n


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.read_at == None,  # noqa: E711
        )
    )
    rows = result.scalars().all()
    now = datetime.now(timezone.utc)
    for n in rows:
        n.read_at = now
    await db.flush()
    return len(rows)


def _payload_matches(notification: Notification, payload_match: dict[str, str]) -> bool:
    if not notification.payload:
        return False
    try:
        data = json.loads(notification.payload)
    except json.JSONDecodeError:
        return False
    if not isinstance(data, dict):
        return False
    for key, expected in payload_match.items():
        if str(data.get(key)) != str(expected):
            return False
    return True


async def resolve_actionable_notifications(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    notification_type: str,
    payload_match: dict[str, str],
) -> int:
    """Mark unread admin actionable notifications matching payload keys as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.type == notification_type,
            Notification.read_at == None,  # noqa: E711
        )
    )
    rows = result.scalars().all()
    now = datetime.now(timezone.utc)
    affected_users: set[uuid.UUID] = set()
    resolved = 0
    for n in rows:
        if not _payload_matches(n, payload_match):
            continue
        n.read_at = now
        affected_users.add(n.user_id)
        resolved += 1
    if resolved:
        await db.flush()
    if redis and affected_users:
        for uid in affected_users:
            unread = await get_unread_count(db, uid)
            await publish_to_user(redis, uid, {"type": "unread_count", "count": unread})
            await publish_to_user(
                redis,
                uid,
                {
                    "type": "notifications_resolved",
                    "data": {"types": [notification_type], "count": resolved},
                },
            )
    return resolved


# ── Event builders ───────────────────────────────────────────────────

def build_change_request_resolved(
    *,
    status: str,
    request_type: str,
    admin_notes: str | None,
    request_id: str,
    bet_id: str,
) -> tuple[str, str, dict[str, Any]]:
    action = "aprobada" if status == "approved" else "rechazada"
    type_label = "modificacion" if request_type == "modify" else "eliminacion"
    title = f"Solicitud de {type_label} {action}"
    body = f"El administrador {action} tu solicitud."
    if admin_notes:
        body += f" Motivo: {admin_notes}"
    payload = {
        "request_id": request_id,
        "bet_id": bet_id,
        "status": status,
        "request_type": request_type,
        "admin_notes": admin_notes,
    }
    return title, body, payload


def build_change_request_pending(
    *,
    username: str,
    request_type: str,
    request_id: str,
    bet_id: str,
    fixture_id: str,
    original_home: int,
    original_away: int,
    new_home: int | None,
    new_away: int | None,
    reason: str | None,
) -> tuple[str, str, dict[str, Any]]:
    type_label = "modificar" if request_type == "modify" else "eliminar"
    title = f"@{username} solicita {type_label} apuesta"
    if request_type == "modify" and new_home is not None and new_away is not None:
        body = (
            f"Pronostico actual: {original_home}-{original_away} → "
            f"nuevo: {new_home}-{new_away}."
        )
    else:
        body = f"Pronostico actual: {original_home}-{original_away}. Solicita eliminar la apuesta."
    if reason:
        body += f" Motivo del usuario: {reason}"
    payload = {
        "request_id": request_id,
        "bet_id": bet_id,
        "fixture_id": fixture_id,
        "request_type": request_type,
        "username": username,
    }
    return title, body, payload


def build_extra_bet_pending(
    *,
    username: str,
    user_id: str,
    bet_id: str,
    group_id: str,
    fixture_id: str,
    amount: str,
    predicted_home: int,
    predicted_away: int,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{username}: extra pendiente de confirmacion"
    body = (
        f"Apuesta extra {predicted_home}-{predicted_away} por {amount}. "
        "Confirma el pago para sumar al pozo."
    )
    payload = {
        "bet_id": bet_id,
        "group_id": group_id,
        "fixture_id": fixture_id,
        "user_id": user_id,
        "username": username,
        "amount": amount,
    }
    return title, body, payload


def build_social_follow(
    *,
    follower_username: str,
    follower_id: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{follower_username} te sigue"
    body = "Tienes un nuevo seguidor. Revisa su perfil."
    return title, body, {"username": follower_username, "user_id": follower_id}


def build_following_bet(
    *,
    username: str,
    user_id: str,
    fixture_id: str,
    bet_id: str,
    home_team: str,
    away_team: str,
    predicted_home: int,
    predicted_away: int,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{username} hizo una apuesta"
    body = f"{home_team} vs {away_team}: pronostico {predicted_home}-{predicted_away}"
    return title, body, {
        "username": username,
        "user_id": user_id,
        "fixture_id": fixture_id,
        "bet_id": bet_id,
        "home_team": home_team,
        "away_team": away_team,
    }


def build_entry_confirmed(*, group_name: str | None = None) -> tuple[str, str, dict[str, Any]]:
    title = "Entrada confirmada"
    body = (
        f"Tu pago de entrada a {group_name} fue confirmado. Ya puedes apostar en la polla."
        if group_name
        else "Tu pago de entrada fue confirmado. Ya puedes apostar en la polla."
    )
    return title, body, {}


def build_phase_enrollment_confirmed(
    *,
    phase_label: str,
    phase_key: str,
    group_id: str,
    is_early_enrollment: bool,
) -> tuple[str, str, dict[str, Any]]:
    title = f"Inscripcion confirmada — {phase_label}"
    if is_early_enrollment:
        body = (
            f"Tu pago para {phase_label} fue confirmado. "
            "Podras apostar en esa fase cuando termine la fase de grupos."
        )
    else:
        body = (
            f"Tu pago para {phase_label} fue confirmado. "
            "Ya puedes apostar en los partidos de esta etapa."
        )
    return title, body, {
        "group_id": group_id,
        "phase_key": phase_key,
        "phase_label": phase_label,
        "is_early_enrollment": is_early_enrollment,
    }


def build_extra_confirmed(
    *,
    amount: str,
    home_team: str,
    away_team: str,
    bet_id: str,
    fixture_id: str,
) -> tuple[str, str, dict[str, Any]]:
    title = "Pago extra confirmado"
    body = f"Tu extra de {amount} en {home_team} vs {away_team} fue confirmado."
    return title, body, {
        "amount": amount,
        "bet_id": bet_id,
        "fixture_id": fixture_id,
        "home_team": home_team,
        "away_team": away_team,
    }


def build_password_reset_resolved() -> tuple[str, str, dict[str, Any]]:
    title = "Recuperacion de contraseña atendida"
    body = "El administrador genero una contraseña temporal. Contactalo para recibirla e inicia sesion."
    return title, body, {}


def build_password_reset_pending(
    *,
    username: str,
    user_id: str,
    request_id: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{username}: recuperación de contraseña"
    body = "El usuario solicitó restablecer su contraseña. Genera una temporal en Solicitudes."
    payload = {
        "user_id": user_id,
        "username": username,
        "request_id": request_id,
    }
    return title, body, payload


def build_entry_pending(
    *,
    username: str,
    user_id: str,
    group_id: str,
    has_proof: bool = False,
    competition_id: str | None = None,
    competition_slug: str | None = None,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{username}: entrada pendiente"
    if has_proof:
        body = "Usuario con comprobante subido. Revisa y confirma su pago de entrada."
    else:
        body = "Usuario registrado. Confirma su pago de entrada a la polla."
    payload: dict[str, Any] = {
        "user_id": user_id,
        "group_id": group_id,
        "username": username,
        "has_proof": has_proof,
    }
    if competition_id:
        payload["competition_id"] = competition_id
    if competition_slug:
        payload["competition_slug"] = competition_slug
    return title, body, payload


def build_change_request_auto_expired_user(
    *,
    request_id: str,
    bet_id: str,
    fixture_id: str,
    home_team: str,
    away_team: str,
) -> tuple[str, str, dict[str, Any]]:
    title = "Solicitud cancelada automaticamente"
    body = (
        f"Tu solicitud de cambio sobre {home_team} vs {away_team} caduco: "
        "el administrador no respondio antes del cierre (1 minuto antes del partido)."
    )
    payload = {
        "request_id": request_id,
        "bet_id": bet_id,
        "fixture_id": fixture_id,
    }
    return title, body, payload


def build_change_request_auto_expired_admins_batch(
    *,
    count: int,
    request_ids: list[str],
) -> tuple[str, str, dict[str, Any]]:
    title = "Solicitudes canceladas por plazo"
    body = (
        f"Se cancelaron automaticamente {count} solicitud(es) de cambio de apuesta "
        "al cerrar la ventana de resolucion (1 minuto antes del partido)."
    )
    payload = {"count": count, "request_ids": request_ids}
    return title, body, payload


def build_comment_mention(
    *,
    author_username: str,
    fixture_id: str,
    comment_id: str,
    home_team: str,
    away_team: str,
    body_preview: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{author_username} te menciono"
    body = f"En {home_team} vs {away_team}: \"{body_preview}\""
    return title, body, {
        "fixture_id": fixture_id,
        "comment_id": comment_id,
        "author_username": author_username,
        "home_team": home_team,
        "away_team": away_team,
    }


def build_badge_earned(*, badge_id: str, badge_label: str) -> tuple[str, str, dict[str, Any]]:
    title = f"Nueva medalla: {badge_label}"
    body = "Desbloqueaste una medalla. Revisa tu perfil y el catalogo en el dashboard."
    return title, body, {"badge_id": badge_id, "badge_label": badge_label}


def build_fixture_finished(
    *,
    fixture_id: str,
    home_team: str,
    away_team: str,
    home_score: int,
    away_score: int,
) -> tuple[str, str, dict[str, Any]]:
    title = f"Partido finalizado: {home_team} vs {away_team}"
    body = f"Resultado final: {home_score}-{away_score}. Revisa tus puntos."
    payload = {
        "fixture_id": fixture_id,
        "home_team": home_team,
        "away_team": away_team,
        "home_score": home_score,
        "away_score": away_score,
    }
    return title, body, payload


def build_fixture_betting_closed(
    *,
    fixture_id: str,
    home_team: str,
    away_team: str,
    reason: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"Apuestas cerradas: {home_team} vs {away_team}"
    body = "Ya no puedes modificar pronosticos para este partido."
    return title, body, {
        "fixture_id": fixture_id,
        "home_team": home_team,
        "away_team": away_team,
        "reason": reason,
    }


def build_fixture_betting_soon_admin(
    *,
    fixture_id: str,
    home_team: str,
    away_team: str,
    minutes_left: int,
) -> tuple[str, str, dict[str, Any]]:
    title = f"Cierra pronto: {home_team} vs {away_team}"
    body = f"Las apuestas se cierran en ~{minutes_left} min. Revisa pendientes."
    return title, body, {
        "fixture_id": fixture_id,
        "home_team": home_team,
        "away_team": away_team,
        "minutes_left": minutes_left,
    }


def build_fixture_betting_closed_admin(
    *,
    fixture_id: str,
    home_team: str,
    away_team: str,
    reason: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"Apuestas cerradas: {home_team} vs {away_team}"
    body = "El partido ya no acepta pronosticos. Liquida cuando termine."
    return title, body, {
        "fixture_id": fixture_id,
        "home_team": home_team,
        "away_team": away_team,
        "reason": reason,
    }


async def notify_fixture_betting_closed(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: "Fixture",
    *,
    reason: str,
) -> None:
    """WS broadcast + inbox for bettors and admins after betting closes."""
    from app.models.bet import Bet
    from app.models.fixture import Fixture

    fid = str(fixture.id)
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )

    nt, nb, np = build_fixture_betting_closed(
        fixture_id=fid,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
        reason=reason,
    )
    bettors = await db.execute(
        select(Bet.user_id)
        .where(Bet.fixture_id == fixture.id, Bet.cancelled_at == None)  # noqa: E711
        .distinct()
    )
    for (uid,) in bettors.all():
        await create_notification(
            db, redis, user_id=uid, type="fixture_betting_closed", title=nt, body=nb, payload=np,
        )

    at, ab, ap = build_fixture_betting_closed_admin(
        fixture_id=fid,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
        reason=reason,
    )
    await notify_admins(db, redis, type="fixture_betting_closed_admin", title=at, body=ab, payload=ap)
