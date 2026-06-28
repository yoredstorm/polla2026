"""Phase entry notifications and competition-admin scoped confirmation."""
import io
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select, and_

from app.models.competition import Competition, CompetitionAdmin
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.competition_service import get_group_for_competition
from app.services.notification_service import notify_admins
from app.services.phase_enrollment_service import enrollment_status_for_phase
from tests.conftest import register_payload
from tests.test_multi_competition import _register, _setup_cups_with_admin

pytestmark = pytest.mark.asyncio


def _tiny_jpeg() -> bytes:
    img = Image.new("RGB", (8, 8), color=(0, 128, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def _login(client: AsyncClient, username: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "MultiComp1!"},
    )


async def test_notify_admins_includes_competition_admins(db_session):
    super_admin = User(
        id=uuid.uuid4(),
        username="phase_super",
        email="phase_super@test.com",
        hashed_password="x",
        is_admin=True,
        is_active=True,
    )
    comp_admin = User(
        id=uuid.uuid4(),
        username="phase_comp_admin",
        email="phase_comp@test.com",
        hashed_password="x",
        is_admin=False,
        is_active=True,
    )
    db_session.add_all([super_admin, comp_admin])
    await db_session.flush()

    comp = Competition(
        slug="phase-notify-cup",
        name="Phase Notify Cup",
        sport="football",
        format_type="tournament",
        status="open",
        visibility="public",
    )
    db_session.add(comp)
    await db_session.flush()
    db_session.add(
        CompetitionAdmin(competition_id=comp.id, user_id=comp_admin.id, role="owner")
    )
    await db_session.flush()

    with patch(
        "app.services.notification_service.create_notification",
        new_callable=AsyncMock,
    ) as mock_create:
        mock_create.side_effect = lambda db, redis, **kw: kw
        created = await notify_admins(
            db_session,
            None,
            type="phase_entry_pending",
            title="Fase pendiente",
            body="Revisar",
            payload={"phase_key": "knockout"},
            competition_id=comp.id,
        )

    assert len(created) == 2
    notified_ids = {call.kwargs["user_id"] for call in mock_create.await_args_list}
    assert super_admin.id in notified_ids
    assert comp_admin.id in notified_ids


@pytest.mark.asyncio
async def test_phase_entry_proof_payload_includes_competition_slug(
    client: AsyncClient,
    db_session,
    monkeypatch,
):
    captured: dict = {}

    async def _capture_notify(db, redis, **kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr("app.api.v1.groups.notify_admins", _capture_notify)
    monkeypatch.setattr("app.api.v1.auth.notify_admins", _capture_notify)

    _, comp_a, slug_a, _, _ = await _setup_cups_with_admin(client, db_session)
    group = await get_group_for_competition(db_session, comp_a.id)
    assert group is not None
    group.prize_structure_mode = "groups_knockout"
    group.current_phase_key = "groups"
    await db_session.commit()

    await _register(client, "phase_proof_user")
    user_cookies = (await _login(client, "phase_proof_user")).cookies

    resp = await client.post(
        "/api/v1/groups/pool/active/phase-entry-proof?phase_key=knockout",
        files={"file": ("ko.jpg", _tiny_jpeg(), "image/jpeg")},
        cookies=user_cookies,
    )
    assert resp.status_code == 201, resp.text

    assert captured.get("type") == "phase_entry_pending"
    payload = captured.get("payload") or {}
    assert payload.get("competition_slug") == slug_a
    assert payload.get("competition_id") == str(comp_a.id)
    assert payload.get("phase_key") == "knockout"
    assert payload.get("phase_label")
    assert payload.get("is_member") is False
    assert captured.get("competition_id") == comp_a.id


@pytest.mark.asyncio
async def test_competition_admin_confirms_phase_enrollment_scoped(
    client: AsyncClient,
    db_session,
    monkeypatch,
):
    async def _noop_notify(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.v1.groups.notify_admins", _noop_notify)
    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop_notify)
    monkeypatch.setattr("app.api.v1.admin.broadcast_polla_updated", _noop_notify)

    comp_admin, comp_a, slug_a, _, _ = await _setup_cups_with_admin(client, db_session)
    group = await get_group_for_competition(db_session, comp_a.id)
    assert group is not None
    group.prize_structure_mode = "groups_knockout"
    group.current_phase_key = "groups"
    await db_session.commit()

    await _register(client, "phase_member")
    member = (
        await db_session.execute(select(User).where(User.username == "phase_member"))
    ).scalar_one()
    member_cookies = (await _login(client, "phase_member")).cookies

    await _login(client, comp_admin.username)

    add_resp = await client.post(
        f"/api/v1/c/{slug_a}/admin/pool/members",
        json={"user_id": str(member.id)},
    )
    assert add_resp.status_code == 201, add_resp.text

    proof_resp = await client.post(
        "/api/v1/groups/pool/active/phase-entry-proof?phase_key=knockout",
        files={"file": ("ko.jpg", _tiny_jpeg(), "image/jpeg")},
        cookies=member_cookies,
    )
    assert proof_resp.status_code == 201, proof_resp.text

    await _login(client, comp_admin.username)

    confirm = await client.post(
        f"/api/v1/c/{slug_a}/admin/pool/phase-enrollments",
        json={"user_id": str(member.id), "phase_key": "knockout"},
    )
    assert confirm.status_code == 201, confirm.text

    status = await enrollment_status_for_phase(db_session, group.id, member.id, "knockout")
    assert status == "confirmed"

    member_row = (
        await db_session.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == group.id, GroupMember.user_id == member.id)
            )
        )
    ).scalar_one_or_none()
    assert member_row is not None
