"""Avatar presets and secure upload handling."""
import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image

from app.core.config import settings

AVATAR_PRESETS: list[dict[str, str]] = [
    {"id": "ball", "label": "Balon", "path": "/avatars/ball.svg"},
    {"id": "trophy", "label": "Trofeo", "path": "/avatars/trophy.svg"},
    {"id": "keeper", "label": "Arquero", "path": "/avatars/keeper.svg"},
    {"id": "fan", "label": "Hincha", "path": "/avatars/fan.svg"},
    {"id": "flag", "label": "Bandera", "path": "/avatars/flag.svg"},
    {"id": "boot", "label": "Botin", "path": "/avatars/boot.svg"},
    {"id": "stadium", "label": "Estadio", "path": "/avatars/stadium.svg"},
    {"id": "star", "label": "Estrella", "path": "/avatars/star.svg"},
]

PRESET_IDS = frozenset(p["id"] for p in AVATAR_PRESETS)

JPEG_MAGIC = (b"\xff\xd8\xff",)
PNG_MAGIC = (b"\x89PNG\r\n\x1a\n",)
WEBP_MAGIC = (b"RIFF",)


def avatar_display_path(preset: str | None, custom_url: str | None) -> str | None:
    if custom_url:
        return custom_url
    if preset and preset in PRESET_IDS:
        return f"/avatars/{preset}.svg"
    return None


def validate_preset(preset: str | None) -> None:
    if preset is not None and preset not in PRESET_IDS:
        raise HTTPException(status_code=400, detail="Invalid avatar preset")


def _is_allowed_image(raw: bytes) -> bool:
    if len(raw) < 12:
        return False
    if raw.startswith(JPEG_MAGIC[0]):
        return True
    if raw.startswith(PNG_MAGIC):
        return True
    if raw.startswith(WEBP_MAGIC) and raw[8:12] == b"WEBP":
        return True
    return False


async def save_avatar_upload(user_id: uuid.UUID, file: UploadFile) -> str:
    raw = await file.read()
    if len(raw) > settings.AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 1 MB)")

    if not _is_allowed_image(raw):
        raise HTTPException(status_code=400, detail="Invalid image file")

    try:
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((256, 256), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        data = out.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not process image")

    dest_dir = Path(settings.AVATAR_UPLOAD_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{user_id}.jpg"
    path.write_bytes(data)
    return f"/api/v1/users/avatar/{user_id}"
