"""Entry payment QR, proof upload, and active polla fields."""
import io
import json

import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _noop_admin_notifications(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.groups.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_polla_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop)


from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select

from app.models.group import Group
from app.models.user import User
from tests.conftest import register_payload


def _tiny_jpeg() -> bytes:
    img = Image.new("RGB", (8, 8), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def _register(client: AsyncClient, username: str):
    return await client.post(
        "/api/v1/auth/register",
        json=register_payload(username),
    )


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


@pytest.mark.asyncio
async def test_create_polla_requires_payment_contact_when_entry_fee(client: AsyncClient, db_session):
    await _register(client, "pay_admin1")
    await _make_admin(db_session, "pay_admin1")
    login = await _login(client, "pay_admin1")

    bad = await client.post(
        "/api/v1/admin/groups",
        json={"name": "Polla", "entry_fee": "10", "currency": "PEN"},
        cookies=login.cookies,
    )
    assert bad.status_code == 400

    ok = await client.post(
        "/api/v1/admin/groups",
        json={
            "name": "Polla",
            "entry_fee": "10",
            "currency": "PEN",
            "payment_contact_name": "Tesoreria",
            "payment_phone": "+51999888777",
        },
        cookies=login.cookies,
    )
    assert ok.status_code == 201
    data = ok.json()
    assert data["payment_contact_name"] == "Tesoreria"
    assert data["payment_phone"] == "+51999888777"


@pytest.mark.asyncio
async def test_entry_proof_and_membership_flow(client: AsyncClient, db_session):
    for g in (await db_session.execute(select(Group))).scalars().all():
        g.is_active = False
    await db_session.flush()

    await _register(client, "pay_admin2")
    admin = await _make_admin(db_session, "pay_admin2")
    login_admin = await _login(client, "pay_admin2")

    created = await client.post(
        "/api/v1/admin/groups",
        json={
            "name": "Polla Pay",
            "entry_fee": "15",
            "currency": "PEN",
            "payment_contact_name": "Caja",
            "payment_phone": "+51000000000",
        },
        cookies=login_admin.cookies,
    )
    group_id = created.json()["id"]

    qr = _tiny_jpeg()
    await client.post(
        f"/api/v1/admin/groups/{group_id}/payment-qr",
        files={"file": ("qr.jpg", qr, "image/jpeg")},
        cookies=login_admin.cookies,
    )

    await _register(client, "pay_user2")
    login_user = await _login(client, "pay_user2")
    user_res = await db_session.execute(select(User).where(User.username == "pay_user2"))
    user = user_res.scalar_one()

    active = await client.get("/api/v1/groups/pool/active", cookies=login_user.cookies)
    assert active.status_code == 200
    body = active.json()
    assert body["id"] == group_id
    assert body["is_member"] is False
    assert body["has_uploaded_proof"] is False
    assert body["payment_contact_name"] == "Caja"
    assert body["payment_qr_url"] is not None
    assert body.get("payment_qr_data_url") is not None
    assert body["payment_qr_data_url"].startswith("data:image/jpeg;base64,")

    proof = _tiny_jpeg()
    up = await client.post(
        "/api/v1/groups/pool/active/entry-proof",
        files={"file": ("proof.jpg", proof, "image/jpeg")},
        cookies=login_user.cookies,
    )
    assert up.status_code == 201

    active2 = await client.get("/api/v1/groups/pool/active", cookies=login_user.cookies)
    assert active2.json()["has_uploaded_proof"] is True

    nm = await client.get(
        f"/api/v1/admin/groups/{group_id}/non-members",
        cookies=login_admin.cookies,
    )
    row = next(r for r in nm.json() if r["user_id"] == str(user.id))
    assert row["has_proof"] is True

    proof_get = await client.get(
        f"/api/v1/admin/groups/{group_id}/entry-proofs/{user.id}",
        cookies=login_admin.cookies,
    )
    assert proof_get.status_code == 200
    assert proof_get.headers["content-type"].startswith("image/")

    confirm = await client.post(
        f"/api/v1/admin/groups/{group_id}/members",
        json={"user_id": str(user.id)},
        cookies=login_admin.cookies,
    )
    assert confirm.status_code == 201

    from app.models.audit_log import AuditLog

    audit_rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "admin_confirm_entry").order_by(AuditLog.created_at.desc())
        )
    ).scalars().all()
    assert audit_rows
    last = json.loads(audit_rows[0].detail or "{}")
    assert last.get("had_proof") is True
    assert last.get("confirmed_with_proof") is True

    active3 = await client.get("/api/v1/groups/pool/active", cookies=login_user.cookies)
    assert active3.json()["is_member"] is True

    up2 = await client.post(
        "/api/v1/groups/pool/active/entry-proof",
        files={"file": ("proof2.jpg", proof, "image/jpeg")},
        cookies=login_user.cookies,
    )
    assert up2.status_code == 403
