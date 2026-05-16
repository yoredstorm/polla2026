"""Notification creation, persistence, and Redis pub/sub for WebSocket push."""
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.models.notification import Notification
from app.models.user import User


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
) -> list[Notification]:
    result = await db.execute(select(User.id).where(User.is_admin == True, User.is_active == True))
    admin_ids = [row[0] for row in result.all()]
    if exclude_user_id is not None:
        admin_ids = [aid for aid in admin_ids if aid != exclude_user_id]
    created: list[Notification] = []
    for admin_id in admin_ids:
        n = await create_notification(
            db, redis, user_id=admin_id, type=type, title=title, body=body, payload=payload,
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


def build_entry_pending(
    *,
    username: str,
    user_id: str,
    group_id: str,
) -> tuple[str, str, dict[str, Any]]:
    title = f"@{username}: entrada pendiente"
    body = "Usuario registrado. Confirma su pago de entrada a la polla."
    payload = {
        "user_id": user_id,
        "group_id": group_id,
        "username": username,
    }
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
        "menos de 1 hora para el inicio del partido."
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
        "al entrar en la ventana de 1 hora antes del partido."
    )
    payload = {"count": count, "request_ids": request_ids}
    return title, body, payload


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
