"""Tests for comment sanitization and mention parsing."""
import pytest

from app.services.comment_sanitizer import (
    extract_mention_usernames,
    sanitize_comment_body,
)


def test_sanitize_strips_html():
    assert sanitize_comment_body("Hola <b>mundo</b>") == "Hola mundo"


def test_sanitize_rejects_empty():
    with pytest.raises(ValueError, match="EMPTY_COMMENT"):
        sanitize_comment_body("   ")


def test_extract_mentions_dedupes_and_limits():
    text = "@alice @bob @alice @carol @dave @eve @frank"
    names = extract_mention_usernames(text)
    assert names[:3] == ["alice", "bob", "carol"]
    assert len(names) <= 5


def test_extract_mentions_valid_pattern():
    assert extract_mention_usernames("Hola @juan_perez!") == ["juan_perez"]
    assert extract_mention_usernames("sin arroba") == []
