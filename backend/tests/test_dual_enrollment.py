"""Dual enrollment for new users: groups or knockout during groups phase."""
import io
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select, and_

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.user import User
from app.schemas.bet import BetCreate
from app.services.bet_service import create_bet
from app.services.phase_enrollment_service import (
    enrollment_status_for_phase,
    is_allowed_proof_phase_key,
    new_user_dual_enrollment_available,
)
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _noop_admin_notifications(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.groups.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_polla_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop)
    monkeypatch.setattr("app.services.notification_service.create_notification", _noop)
    monkeypatch.setattr("app.services.notification_service.publish_to_user", _noop)


def _tiny_jpeg() -> bytes:
    img = Image.new("RGB", (8, 8), color=(0, 128, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def _register(client: AsyncClient, username: str):
    return await client.post("/api/v1/auth/register", json=register_payload(username))


async def _login(client: AsyncClient, username: str):
    return await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "SecurePass1"},
    )


async def _make_admin(db_session, username: str) -> User:
    result = await db_session.execute(select(User).where(User.username == username))
    user = result.scalar_one()
    user.is_admin = True
    await db_session.flush()
    return user


async def _deactivate_groups(db_session):
    for g in (await db_session.execute(select(Group))).scalars().all():
        g.is_active = False
    await db_session.flush()


async def _create_groups_knockout_polla(client: AsyncClient, cookies) -> str:
    created = await client.post(
        "/api/v1/admin/groups",
        json={
            "name": "Dual KO Polla",
            "entry_fee": "20",
            "currency": "PEN",
            "payment_contact_name": "Tesorería",
            "payment_phone": "+51999000000",
            "prize_structure_mode": "groups_knockout",
        },
        cookies=cookies,
    )
    assert created.status_code == 201
    return created.json()["id"]


@pytest.mark.asyncio
async def test_new_user_can_upload_knockout_proof_while_not_member(client: AsyncClient, db_session):
    await _deactivate_groups(db_session)
    await _register(client, "dual_admin1")
    await _make_admin(db_session, "dual_admin1")
    admin_cookies = (await _login(client, "dual_admin1")).cookies
    group_id = await _create_groups_knockout_polla(client, admin_cookies)

    await _register(client, "dual_ko_new")
    user_cookies = (await _login(client, "dual_ko_new")).cookies

    group = (
        await db_session.execute(select(Group).where(Group.id == uuid.UUID(group_id)))
    ).scalar_one()
    assert new_user_dual_enrollment_available(group)
    assert is_allowed_proof_phase_key(
        group,
        is_member=False,
        current_status="none",
        phase_key="knockout",
    )

    active = await client.get("/api/v1/groups/pool/active", cookies=user_cookies)
    assert active.status_code == 200
    body = active.json()
    assert body["is_member"] is False
    assert len(body["enrollment_choices"]) == 2
    assert body.get("payment_target_phase_key") is None

    proof = _tiny_jpeg()
    up = await client.post(
        "/api/v1/groups/pool/active/phase-entry-proof?phase_key=knockout",
        files={"file": ("ko_proof.jpg", proof, "image/jpeg")},
        cookies=user_cookies,
    )
    assert up.status_code == 201

    active2 = await client.get("/api/v1/groups/pool/active", cookies=user_cookies)
    data = active2.json()
    assert data["payment_target_phase_key"] == "knockout"
    assert data["has_uploaded_proof"] is True
    assert data["early_enrollment_available"] is True

    user_res = await db_session.execute(select(User).where(User.username == "dual_ko_new"))
    user = user_res.scalar_one()

    nm = await client.get(
        f"/api/v1/admin/groups/{group_id}/non-members",
        cookies=admin_cookies,
    )
    assert not any(r["user_id"] == str(user.id) for r in nm.json())

    pending = await client.get(
        f"/api/v1/admin/groups/{group_id}/phase-pending-entries?phase_key=knockout",
        cookies=admin_cookies,
    )
    rows = pending.json()["pending"]
    row = next(r for r in rows if r["user_id"] == str(user.id))
    assert row["is_member"] is False


@pytest.mark.asyncio
async def test_add_member_knockout_only_skips_groups_enrollment(client: AsyncClient, db_session):
    await _deactivate_groups(db_session)
    await _register(client, "dual_admin2")
    await _make_admin(db_session, "dual_admin2")
    admin_cookies = (await _login(client, "dual_admin2")).cookies
    group_id = await _create_groups_knockout_polla(client, admin_cookies)

    await _register(client, "dual_ko_only")
    user_cookies = (await _login(client, "dual_ko_only")).cookies
    user_res = await db_session.execute(select(User).where(User.username == "dual_ko_only"))
    user = user_res.scalar_one()

    proof = _tiny_jpeg()
    up = await client.post(
        "/api/v1/groups/pool/active/phase-entry-proof?phase_key=knockout",
        files={"file": ("ko_proof.jpg", proof, "image/jpeg")},
        cookies=user_cookies,
    )
    assert up.status_code == 201

    confirm = await client.post(
        f"/api/v1/admin/groups/{group_id}/members",
        json={"user_id": str(user.id), "phase_key": "knockout"},
        cookies=admin_cookies,
    )
    assert confirm.status_code == 201

    groups_status = await enrollment_status_for_phase(
        db_session, uuid.UUID(group_id), user.id, "groups"
    )
    ko_status = await enrollment_status_for_phase(
        db_session, uuid.UUID(group_id), user.id, "knockout"
    )
    assert groups_status == "none"
    assert ko_status == "confirmed"

    member = (
        await db_session.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == uuid.UUID(group_id), GroupMember.user_id == user.id)
            )
        )
    ).scalar_one_or_none()
    assert member is not None


@pytest.mark.asyncio
async def test_knockout_only_new_user_cannot_bet_groups_fixture(client: AsyncClient, db_session):
    await _deactivate_groups(db_session)
    await _register(client, "dual_admin3")
    await _make_admin(db_session, "dual_admin3")
    admin_cookies = (await _login(client, "dual_admin3")).cookies
    group_id = await _create_groups_knockout_polla(client, admin_cookies)

    await _register(client, "dual_ko_bettor")
    user_cookies = (await _login(client, "dual_ko_bettor")).cookies
    user_res = await db_session.execute(select(User).where(User.username == "dual_ko_bettor"))
    user = user_res.scalar_one()

    proof = _tiny_jpeg()
    await client.post(
        "/api/v1/groups/pool/active/phase-entry-proof?phase_key=knockout",
        files={"file": ("ko_proof.jpg", proof, "image/jpeg")},
        cookies=user_cookies,
    )
    await client.post(
        f"/api/v1/admin/groups/{group_id}/members",
        json={"user_id": str(user.id), "phase_key": "knockout"},
        cookies=admin_cookies,
    )

    group_fixture = Fixture(
        external_id=88001,
        home_team="A",
        away_team="B",
        league_name="WC",
        league_id=1,
        match_date=datetime(2026, 12, 15, 18, 0, tzinfo=timezone.utc),
        status="scheduled",
        season=2026,
        group_name="Group A",
        betting_open=True,
    )
    db_session.add(group_fixture)
    await db_session.flush()

    with pytest.raises(ValueError, match="PHASE_NOT_ENROLLED|PHASE_MISMATCH"):
        await create_bet(
            db_session,
            user.id,
            BetCreate(
                fixture_id=group_fixture.id,
                predicted_home_score=1,
                predicted_away_score=0,
            ),
        )


@pytest.mark.asyncio
async def test_new_user_groups_path_unchanged(client: AsyncClient, db_session):
    await _deactivate_groups(db_session)
    await _register(client, "dual_admin4")
    await _make_admin(db_session, "dual_admin4")
    admin_cookies = (await _login(client, "dual_admin4")).cookies
    group_id = await _create_groups_knockout_polla(client, admin_cookies)

    await _register(client, "dual_groups_new")
    user_cookies = (await _login(client, "dual_groups_new")).cookies
    user_res = await db_session.execute(select(User).where(User.username == "dual_groups_new"))
    user = user_res.scalar_one()

    proof = _tiny_jpeg()
    up = await client.post(
        "/api/v1/groups/pool/active/entry-proof",
        files={"file": ("groups_proof.jpg", proof, "image/jpeg")},
        cookies=user_cookies,
    )
    assert up.status_code == 201

    active = await client.get("/api/v1/groups/pool/active", cookies=user_cookies)
    assert active.json()["payment_target_phase_key"] == "groups"
    assert active.json()["has_uploaded_proof"] is True

    confirm = await client.post(
        f"/api/v1/admin/groups/{group_id}/members",
        json={"user_id": str(user.id)},
        cookies=admin_cookies,
    )
    assert confirm.status_code == 201

    groups_status = await enrollment_status_for_phase(
        db_session, uuid.UUID(group_id), user.id, "groups"
    )
    ko_status = await enrollment_status_for_phase(
        db_session, uuid.UUID(group_id), user.id, "knockout"
    )
    assert groups_status == "confirmed"
    assert ko_status == "none"

    enr = (
        await db_session.execute(
            select(GroupPhaseEnrollment).where(
                and_(
                    GroupPhaseEnrollment.group_id == uuid.UUID(group_id),
                    GroupPhaseEnrollment.user_id == user.id,
                    GroupPhaseEnrollment.phase_key == "groups",
                )
            )
        )
    ).scalar_one_or_none()
    assert enr is not None
    assert enr.status == "confirmed"
