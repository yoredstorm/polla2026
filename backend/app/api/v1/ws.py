"""WebSocket endpoint for real-time notifications."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal, get_redis
from app.models.user import User
from app.services.notification_service import get_unread_count
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/ws", tags=["WebSocket"])


async def _user_from_cookie(access_token: str | None):
    if not access_token:
        return None
    payload = decode_access_token(access_token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            return None
        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            return None
        return user


@router.websocket("/notifications")
async def notifications_ws(websocket: WebSocket):
    access_token = websocket.cookies.get("access_token")
    user = await _user_from_cookie(access_token)
    if not user:
        await websocket.close(code=4401)
        return

    await ws_manager.connect(user.id, websocket)

    async with AsyncSessionLocal() as db:
        unread = await get_unread_count(db, user.id)
    await websocket.send_text(json.dumps({"type": "snapshot", "unread_count": unread}))

    try:
        while True:
            raw = await websocket.receive_text()
            if raw.strip() == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(user.id, websocket)
