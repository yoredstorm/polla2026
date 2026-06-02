"""
Static check: no f-string SQL in application code (SQL injection guard for CI).
"""
from pathlib import Path
import re

APP_ROOT = Path(__file__).resolve().parents[1] / "app"

# Patterns that suggest dynamic SQL concatenation
FORBIDDEN = [
    re.compile(r'\bexecute\s*\(\s*f["\']'),
    re.compile(r'\btext\s*\(\s*f["\']'),
    re.compile(r'\.execute\s*\(\s*["\'].*%s'),
    re.compile(r'\.execute\s*\(\s*["\'].*\{'),
]


def test_no_dynamic_sql_patterns_in_app_code():
    violations: list[str] = []
    for path in APP_ROOT.rglob("*.py"):
        if path.name.startswith("."):
            continue
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            for pattern in FORBIDDEN:
                if pattern.search(line):
                    violations.append(f"{path.relative_to(APP_ROOT.parent)}:{line_no}: {stripped[:120]}")
    assert not violations, "Dynamic SQL patterns found:\n" + "\n".join(violations)
