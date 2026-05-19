"""Display helpers for user real names and nicknames."""
import re

_NAME_RE = re.compile(r"^[\w\s'\-]{2,50}$", re.UNICODE)


def normalize_name(value: str) -> str:
    return " ".join(value.strip().split())


def validate_person_name(value: str, field: str = "name") -> str:
    normalized = normalize_name(value)
    if len(normalized) < 2 or len(normalized) > 50:
        raise ValueError(f"{field} must be 2-50 characters")
    if not _NAME_RE.match(normalized):
        raise ValueError(f"{field} contains invalid characters")
    return normalized


def full_name(first: str | None, last: str | None) -> str | None:
    parts = [p for p in (normalize_name(first) if first else "", normalize_name(last) if last else "") if p]
    return " ".join(parts) if parts else None


def user_label(first: str | None, last: str | None, username: str) -> str:
    name = full_name(first, last)
    if name:
        return f"{name} (@{username})"
    return f"@{username}"
