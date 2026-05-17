"""Recent activity feed for engagement."""
from fastapi import APIRouter, Request, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.audit_log import AuditLog
from app.services.audit_formatter import ACTION_LABELS_ES, enrich_audit_rows

router = APIRouter(prefix="/activity", tags=["Activity"])

PUBLIC_ACTIONS = {
    "challenge_settled",
    "admin_settle",
    "bet_create",
    "challenge_created",
    "bulk_copy",
}


@router.get("/recent")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def recent_activity(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(30, ge=1, le=50),
):
    q = (
        select(AuditLog)
        .where(AuditLog.action.in_(PUBLIC_ACTIONS))
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    enriched = await enrich_audit_rows(db, rows)
    out = []
    for row, (label, summary) in zip(rows, enriched):
        out.append(
            {
                "id": str(row.id),
                "action": row.action,
                "action_label": label,
                "summary": summary,
                "created_at": row.created_at.isoformat(),
            }
        )
    return {"data": out}
