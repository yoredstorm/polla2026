"""Audit log queries scoped to a competition (incl. legacy rows sin competition_id)."""
from __future__ import annotations

import uuid

from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.competition import Competition
from app.services.competition_service import get_group_for_competition


def competition_audit_log_filter(comp: Competition, group_id: uuid.UUID | None):
    """Rows for this competition: tagged directly or legacy detail referencing pool/fixtures/bets."""
    direct = AuditLog.competition_id == comp.id

    legacy_parts = [
        text(
            "EXISTS (SELECT 1 FROM fixtures f "
            "WHERE f.competition_id = :cid "
            "AND audit_logs.detail LIKE '%' || CAST(f.id AS TEXT) || '%')"
        ).bindparams(cid=comp.id),
        text(
            "EXISTS (SELECT 1 FROM bets b "
            "WHERE b.competition_id = :cid "
            "AND audit_logs.detail LIKE '%' || CAST(b.id AS TEXT) || '%')"
        ).bindparams(cid=comp.id),
    ]
    if group_id:
        legacy_parts.append(
            text("audit_logs.detail LIKE :gpat").bindparams(gpat=f"%{group_id}%")
        )

    legacy = and_(AuditLog.competition_id.is_(None), or_(*legacy_parts))
    return or_(direct, legacy)


async def resolve_competition_id_from_detail(
    db: AsyncSession,
    detail: dict | None,
) -> uuid.UUID | None:
    """Infer competition_id from group_id, fixture_id or bet_id in audit detail."""
    if not detail:
        return None

    from app.models.fixture import Fixture
    from app.models.group import Group
    from app.models.bet import Bet

    raw_group = detail.get("group_id")
    if raw_group:
        try:
            gid = uuid.UUID(str(raw_group))
        except ValueError:
            gid = None
        if gid:
            group = await db.get(Group, gid)
            if group and group.competition_id:
                return group.competition_id

    raw_fixture = detail.get("fixture_id")
    if raw_fixture:
        try:
            fid = uuid.UUID(str(raw_fixture))
        except ValueError:
            fid = None
        if fid:
            fixture = await db.get(Fixture, fid)
            if fixture and fixture.competition_id:
                return fixture.competition_id

    raw_bet = detail.get("bet_id")
    if raw_bet:
        try:
            bid = uuid.UUID(str(raw_bet))
        except ValueError:
            bid = None
        if bid:
            bet = await db.get(Bet, bid)
            if bet and bet.competition_id:
                return bet.competition_id

    return None
