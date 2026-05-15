"""Audit log helper — fire-and-forget within the caller's transaction."""
import json
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    action: str,
    detail: dict[str, Any] | str | None = None,
    ip: str | None = None,
) -> None:
    if isinstance(detail, dict):
        detail = json.dumps(detail, default=str)
    db.add(AuditLog(user_id=user_id, action=action, detail=detail, ip_address=ip))
