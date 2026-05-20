"""Payment QR and entry proof image uploads."""
import base64
import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image

from app.core.config import settings
from app.services.avatar_service import _is_allowed_image

JPEG_MAGIC = (b"\xff\xd8\xff",)
PNG_MAGIC = (b"\x89PNG\r\n\x1a\n",)


def payment_qr_public_url(group_id: uuid.UUID) -> str:
    return f"/api/v1/groups/payment-qr/{group_id}"


def _process_image(raw: bytes, max_bytes: int, max_dim: int) -> bytes:
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail="Image too large")
    if not _is_allowed_image(raw):
        raise HTTPException(status_code=400, detail="Invalid image file")
    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=88, optimize=True)
        return out.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not process image")


async def save_group_payment_qr(group_id: uuid.UUID, file: UploadFile) -> str:
    raw = await file.read()
    data = _process_image(raw, settings.PAYMENT_MAX_BYTES, 512)
    dest_dir = Path(settings.PAYMENT_QR_UPLOAD_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{group_id}.jpg"
    path.write_bytes(data)
    return str(path)


async def save_entry_proof(group_id: uuid.UUID, user_id: uuid.UUID, file: UploadFile) -> str:
    raw = await file.read()
    data = _process_image(raw, settings.PAYMENT_MAX_BYTES, 1600)
    dest_dir = Path(settings.ENTRY_PROOF_UPLOAD_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{group_id}_{user_id}.jpg"
    path.write_bytes(data)
    return str(path)


def resolve_readable_path(stored_path: str) -> Path:
    p = Path(stored_path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return p


def payment_qr_data_url(stored_path: str | None) -> str | None:
    """Inline QR as data URL so the dashboard need not cross-fetch :8000 (avoids CORS)."""
    if not stored_path:
        return None
    try:
        path = resolve_readable_path(stored_path)
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"
    except HTTPException:
        return None
