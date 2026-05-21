"""Admin notification delivery via notify_admins."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.user import User
from app.services.notification_service import notify_admins

pytestmark = pytest.mark.asyncio


async def _make_admin(db_session, username: str, *, is_admin: bool = True) -> User:
    user = User(
        id=uuid.uuid4(),
        username=username,
        email=f"{username}@test.com",
        hashed_password="x",
        is_admin=is_admin,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_notify_admins_creates_one_per_admin(db_session):
    admin1 = await _make_admin(db_session, "admin_one")
    admin2 = await _make_admin(db_session, "admin_two")
    await _make_admin(db_session, "regular_user", is_admin=False)

    with patch(
        "app.services.notification_service.create_notification",
        new_callable=AsyncMock,
    ) as mock_create:
        mock_create.side_effect = lambda db, redis, **kw: kw
        created = await notify_admins(
            db_session,
            None,
            type="entry_pending",
            title="Entrada pendiente",
            body="Revisar pago",
            payload={"user_id": "x"},
        )

    assert len(created) == 2
    assert mock_create.await_count == 2
    notified_ids = {call.kwargs["user_id"] for call in mock_create.await_args_list}
    assert admin1.id in notified_ids
    assert admin2.id in notified_ids


@pytest.mark.asyncio
async def test_notify_admins_solo_admin_not_excluded(db_session):
    solo = await _make_admin(db_session, "solo_admin")

    with patch(
        "app.services.notification_service.create_notification",
        new_callable=AsyncMock,
    ) as mock_create:
        mock_create.return_value = "notification"
        created = await notify_admins(
            db_session,
            None,
            type="extra_bet_pending",
            title="Extra pendiente",
            body="Confirmar pago",
            exclude_user_id=solo.id,
        )

    assert len(created) == 1
    mock_create.assert_awaited_once()
    assert mock_create.await_args.kwargs["user_id"] == solo.id


@pytest.mark.asyncio
async def test_notify_admins_excludes_actor_when_multiple_admins(db_session):
    actor = await _make_admin(db_session, "actor_admin")
    other = await _make_admin(db_session, "other_admin")

    with patch(
        "app.services.notification_service.create_notification",
        new_callable=AsyncMock,
    ) as mock_create:
        mock_create.return_value = "notification"
        created = await notify_admins(
            db_session,
            None,
            type="extra_bet_pending",
            title="Extra",
            body="Body",
            exclude_user_id=actor.id,
        )

    assert len(created) == 1
    assert mock_create.await_args.kwargs["user_id"] == other.id


@pytest.mark.asyncio
async def test_notify_admins_no_recipients_when_no_admins(db_session):
    await _make_admin(db_session, "not_admin", is_admin=False)

    with patch(
        "app.services.notification_service.create_notification",
        new_callable=AsyncMock,
    ) as mock_create:
        created = await notify_admins(
            db_session,
            None,
            type="entry_pending",
            title="T",
            body="B",
        )

    assert created == []
    mock_create.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_notification_attempts_push_for_admin_type(db_session):
    """Integration: extra_bet_pending triggers push path when VAPID configured."""
    from app.core import config
    from app.services.notification_service import create_notification

    admin = await _make_admin(db_session, "push_admin")
    monkeypatch_vapid = {
        "VAPID_PUBLIC_KEY": "BIqzYsOiaU0RBVVaN4RhsJCnGp02QO9T8PywY08zvg9js83aK7J3Pd4_YkW66BO1CGYAYFiTzDIrSdPYeBXh5Ow",
        "VAPID_PRIVATE_KEY": "g5iyoLfzVn2oydLYnvIP8sKi5IaYTOVkhIkTxBjunGk",
    }
    for key, val in monkeypatch_vapid.items():
        setattr(config.settings, key, val)

    with patch(
        "app.services.push_service.send_web_push_for_notification",
        new_callable=AsyncMock,
        return_value=(0, None),
    ) as mock_push:
        n = await create_notification(
            db_session,
            None,
            user_id=admin.id,
            type="extra_bet_pending",
            title="Extra",
            body="Pago pendiente",
        )

    mock_push.assert_awaited_once()
    assert n.type == "extra_bet_pending"

    row = (await db_session.execute(select(User).where(User.id == admin.id))).scalar_one()
    assert row.is_admin is True
