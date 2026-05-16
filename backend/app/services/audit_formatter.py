"""Human-readable Spanish labels and detail summaries for audit log entries."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group
from app.models.user import User

ACTION_LABELS_ES: dict[str, str] = {
    "register": "Registro",
    "login": "Inicio de sesión",
    "logout": "Cierre de sesión",
    "change_password": "Cambio de contraseña",
    "bet_create": "Nueva apuesta",
    "bet_extra": "Apuesta extra",
    "bulk_copy": "Copia masiva",
    "bet_change_request": "Solicitud de cambio",
    "admin_confirm_entry": "Confirmar entrada",
    "admin_confirm_extra": "Confirmar apuesta extra",
    "admin_approve_change_request": "Aprobar solicitud",
    "admin_reject_change_request": "Rechazar solicitud",
    "change_request_auto_expired": "Solicitudes caducadas",
    "admin_edit_fixture": "Editar partido",
    "admin_settle": "Liquidar partido",
}


@dataclass
class _LookupCtx:
    fixtures: dict[str, Fixture] = field(default_factory=dict)
    groups: dict[str, Group] = field(default_factory=dict)
    users: dict[str, User] = field(default_factory=dict)
    bets: dict[str, Bet] = field(default_factory=dict)

    def fixture_label(self, fid: str | None) -> str | None:
        if not fid:
            return None
        f = self.fixtures.get(fid)
        if not f:
            return None
        parts = [f"{f.home_team} vs {f.away_team}"]
        if f.group_name:
            parts.append(f"Grupo {f.group_name}")
        elif f.round:
            parts.append(f.round)
        return " · ".join(parts)

    def group_label(self, gid: str | None) -> str | None:
        if not gid:
            return None
        g = self.groups.get(gid)
        return g.name if g else None

    def user_label(self, uid: str | None) -> str | None:
        if not uid:
            return None
        u = self.users.get(uid)
        return f"@{u.username}" if u else None


def action_label_es(action: str) -> str:
    return ACTION_LABELS_ES.get(action, action.replace("_", " ").title())


def _parse_detail(detail: str | None) -> dict[str, Any]:
    if not detail:
        return {}
    try:
        data = json.loads(detail)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _collect_ids(details: list[str | None]) -> tuple[set[uuid.UUID], set[uuid.UUID], set[uuid.UUID], set[uuid.UUID]]:
    fixture_ids: set[uuid.UUID] = set()
    group_ids: set[uuid.UUID] = set()
    user_ids: set[uuid.UUID] = set()
    bet_ids: set[uuid.UUID] = set()

    def add_uuid(target: set[uuid.UUID], raw: Any) -> None:
        if not raw:
            return
        try:
            target.add(uuid.UUID(str(raw)))
        except (ValueError, TypeError):
            pass

    for detail in details:
        d = _parse_detail(detail)
        add_uuid(fixture_ids, d.get("fixture_id"))
        add_uuid(group_ids, d.get("group_id"))
        for key in ("user_id", "member_user_id", "bet_user_id"):
            add_uuid(user_ids, d.get(key))
        add_uuid(bet_ids, d.get("bet_id"))

    return fixture_ids, group_ids, user_ids, bet_ids


async def _load_context(
    db: AsyncSession,
    fixture_ids: set[uuid.UUID],
    group_ids: set[uuid.UUID],
    user_ids: set[uuid.UUID],
    bet_ids: set[uuid.UUID],
) -> _LookupCtx:
    ctx = _LookupCtx()

    if fixture_ids:
        res = await db.execute(select(Fixture).where(Fixture.id.in_(fixture_ids)))
        for f in res.scalars().all():
            ctx.fixtures[str(f.id)] = f

    if group_ids:
        res = await db.execute(select(Group).where(Group.id.in_(group_ids)))
        for g in res.scalars().all():
            ctx.groups[str(g.id)] = g

    if user_ids:
        res = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in res.scalars().all():
            ctx.users[str(u.id)] = u

    if bet_ids:
        res = await db.execute(select(Bet).where(Bet.id.in_(bet_ids)))
        extra_fixture_ids: set[uuid.UUID] = set()
        for b in res.scalars().all():
            ctx.bets[str(b.id)] = b
            if b.fixture_id and str(b.fixture_id) not in ctx.fixtures:
                extra_fixture_ids.add(b.fixture_id)
        if extra_fixture_ids:
            res = await db.execute(select(Fixture).where(Fixture.id.in_(extra_fixture_ids)))
            for f in res.scalars().all():
                ctx.fixtures[str(f.id)] = f

    return ctx


def format_detail_summary(action: str, detail: str | None, ctx: _LookupCtx) -> str:
    d = _parse_detail(detail)

    if action == "register":
        return "Nuevo usuario en el sistema"

    if action == "login":
        return "Sesión iniciada"

    if action == "logout":
        return "Sesión cerrada"

    if action == "change_password":
        return "Contraseña actualizada"

    if action == "bet_create":
        fx = ctx.fixture_label(d.get("fixture_id"))
        partido = fx or "Partido desconocido"
        grupo = ctx.group_label(d.get("group_id")) if d.get("group_id") else "Apuesta gratuita (sin extra)"
        return f"{partido} · Pronóstico {d.get('home', '?')}-{d.get('away', '?')} · {grupo}"

    if action == "bulk_copy":
        return (
            f"Ítems: {d.get('total_items', 0)} · Creadas: {d.get('created', 0)} · "
            f"Omitidas: {d.get('skipped', 0)} · Errores: {d.get('error_count', 0)}"
        )

    if action == "bet_change_request":
        bet_id = d.get("bet_id")
        bet = ctx.bets.get(str(bet_id)) if bet_id else None
        fx_id = str(bet.fixture_id) if bet else d.get("fixture_id")
        partido = ctx.fixture_label(fx_id) or "Partido"
        tipo = "modificar marcador" if d.get("type") == "modify" else "eliminar apuesta"
        extra = ""
        if d.get("type") == "modify" and d.get("new_home") is not None:
            extra = f" → nuevo {d.get('new_home')}-{d.get('new_away')}"
        if d.get("reason"):
            extra += f" · Motivo: {d['reason']}"
        return f"{partido} · Solicitud: {tipo}{extra}"

    if action == "admin_confirm_entry":
        polla = ctx.group_label(d.get("group_id")) or "Polla"
        jugador = ctx.user_label(d.get("member_user_id")) or "Usuario"
        fee = d.get("entry_fee", "")
        return f"{polla} · Entrada confirmada para {jugador} · Cuota {fee}"

    if action == "admin_confirm_extra":
        bet = ctx.bets.get(str(d.get("bet_id"))) if d.get("bet_id") else None
        fx_id = str(bet.fixture_id) if bet else None
        partido = ctx.fixture_label(fx_id) or "Partido"
        polla = ctx.group_label(d.get("group_id")) or "Polla"
        jugador = ctx.user_label(d.get("bet_user_id")) or "Usuario"
        if bet:
            partido += f" · Pronóstico {bet.predicted_home_score}-{bet.predicted_away_score}"
        return f"{partido} · {polla} · Extra de {jugador} confirmado · Monto {d.get('amount', '')}"

    if action in ("admin_approve_change_request", "admin_reject_change_request"):
        bet = ctx.bets.get(str(d.get("bet_id"))) if d.get("bet_id") else None
        fx_id = str(bet.fixture_id) if bet else None
        partido = ctx.fixture_label(fx_id) or "Partido"
        jugador = ctx.user_label(d.get("user_id")) or "Usuario"
        tipo = "modificar" if d.get("type") == "modify" else "eliminar"
        verbo = "Aprobada" if action == "admin_approve_change_request" else "Rechazada"
        notes = d.get("admin_notes") or d.get("notes") or ""
        line = f"{partido} · {jugador} · Solicitud de {tipo} {verbo.lower()}"
        if bet:
            line += f" · Pronóstico {bet.predicted_home_score}-{bet.predicted_away_score}"
        if notes:
            line += f" · Nota: {notes}"
        return line

    if action == "change_request_auto_expired":
        count = d.get("count", 0)
        return f"{count} solicitud(es) expirada(s) automáticamente (ventana 1 h antes del partido)"

    if action == "admin_edit_fixture":
        partido = ctx.fixture_label(d.get("fixture_id")) or "Partido"
        changes = d.get("changes") or {}
        if isinstance(changes, dict) and changes:
            bits = []
            if "home_team" in changes or "away_team" in changes:
                bits.append("equipos")
            if "match_date" in changes:
                bits.append("fecha")
            if "betting_open" in changes:
                bits.append("apuestas " + ("abiertas" if changes["betting_open"] else "cerradas"))
            if "venue" in changes:
                bits.append("sede")
            return f"{partido} · Cambios: {', '.join(bits) or 'varios'}"
        return f"{partido} · Metadatos actualizados"

    if action == "admin_settle":
        partido = ctx.fixture_label(d.get("fixture_id")) or "Partido"
        return (
            f"{partido} · Resultado final {d.get('home_score', '?')}-{d.get('away_score', '?')} · "
            f"Apuestas liquidadas: {d.get('settled_count', 0)} · "
            f"Usuarios notificados: {d.get('notified_users_count', 0)}"
        )

    # Fallback: friendly key-value in Spanish
    key_labels = {
        "fixture_id": "Partido",
        "group_id": "Polla",
        "bet_id": "Apuesta",
        "amount": "Monto",
        "home": "Local",
        "away": "Visitante",
    }
    parts = []
    for k, v in list(d.items())[:6]:
        label = key_labels.get(k, k)
        if k == "fixture_id":
            parts.append(f"{label}: {ctx.fixture_label(str(v)) or v}")
        elif k == "group_id":
            parts.append(f"{label}: {ctx.group_label(str(v)) or v}")
        else:
            parts.append(f"{label}: {v}")
    return " · ".join(parts) if parts else "—"


async def enrich_audit_rows(
    db: AsyncSession,
    rows: list[Any],
) -> list[tuple[str, str]]:
    """Returns list of (action_label, detail_summary) parallel to rows."""
    details = [r.detail for r in rows]
    f_ids, g_ids, u_ids, b_ids = _collect_ids(details)
    ctx = await _load_context(db, f_ids, g_ids, u_ids, b_ids)
    return [
        (
            action_label_es(r.action),
            format_detail_summary(r.action, r.detail, ctx),
        )
        for r in rows
    ]
