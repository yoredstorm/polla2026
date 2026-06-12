"""
Repair audit log + notification text for a wrongly settled challenge (after
repair_challenge_wrong_scoring_bet.py already fixed challenges + group_members).

This script ONLY updates:
  - audit_logs rows with action = 'challenge_settled' for the given challenge_id
  - notifications with type = 'challenge_settled' whose payload references that challenge

It does NOT touch bets, group_members, or challenges.

Usage (inside backend container):
  DRY_RUN=1 python scripts/repair_challenge_audit_trail.py
  DRY_RUN=0 python scripts/repair_challenge_audit_trail.py

Optional env:
  CHALLENGE_ID=4b6ad225-5220-461b-a335-46aaf572c330
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone


def _parse_detail(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _parse_payload(raw: str | None) -> dict:
    return _parse_detail(raw)


async def main() -> None:
    import asyncpg

    dry_run = os.environ.get("DRY_RUN", "1") != "0"
    challenge_id = os.environ.get(
        "CHALLENGE_ID", "4b6ad225-5220-461b-a335-46aaf572c330"
    )

    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    url = url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(url)
    try:
        ch = await conn.fetchrow(
            """
            SELECT id, winner_id, challenger_fixture_points, challenged_fixture_points,
                   stake_points, challenger_id, challenged_id
            FROM challenges
            WHERE id = $1
            """,
            uuid.UUID(challenge_id),
        )
        if not ch:
            raise SystemExit(f"Challenge not found: {challenge_id}")

        audit_rows = await conn.fetch(
            """
            SELECT id, action, detail, created_at
            FROM audit_logs
            WHERE action = 'challenge_settled'
              AND detail LIKE $1
            ORDER BY created_at
            """,
            f"%{challenge_id}%",
        )

        notif_rows = await conn.fetch(
            """
            SELECT id, user_id, type, title, body, payload, created_at
            FROM notifications
            WHERE type = 'challenge_settled'
              AND payload LIKE $1
            ORDER BY created_at
            """,
            f"%{challenge_id}%",
        )

        c_pts = int(ch["challenger_fixture_points"] or 0)
        d_pts = int(ch["challenged_fixture_points"] or 0)
        stake = int(ch["stake_points"])

        audit_updates: list[dict] = []
        for row in audit_rows:
            detail = _parse_detail(row["detail"])
            if detail.get("challenge_id") != challenge_id:
                continue
            new_detail = {
                **detail,
                "winner_id": str(ch["winner_id"]) if ch["winner_id"] else None,
                "challenger_points": c_pts,
                "challenged_points": d_pts,
                "stake": stake,
                "repaired_audit_trail": True,
                "repaired_at": datetime.now(timezone.utc).isoformat(),
            }
            audit_updates.append(
                {
                    "id": str(row["id"]),
                    "created_at": row["created_at"].isoformat(),
                    "before": detail,
                    "after": new_detail,
                }
            )

        notif_updates: list[dict] = []
        for row in notif_rows:
            payload = _parse_payload(row["payload"])
            if payload.get("challenge_id") != challenge_id:
                continue
            tie = ch["winner_id"] is None
            won = ch["winner_id"] == row["user_id"]
            new_title = "Reto: empate" if tie else ("Reto ganado" if won else "Reto perdido")
            new_body = f"Resultado {c_pts}-{d_pts} en el partido. "
            if tie:
                new_body += "Puntos devueltos."
            elif won:
                new_body += f"Ganaste {stake} pts del rival."
            else:
                new_body += f"Perdiste {stake} pts."
            new_payload = {
                **payload,
                "winner_id": str(ch["winner_id"]) if ch["winner_id"] else None,
            }
            notif_updates.append(
                {
                    "id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "created_at": row["created_at"].isoformat(),
                    "before": {
                        "title": row["title"],
                        "body": row["body"],
                        "payload": payload,
                    },
                    "after": {
                        "title": new_title,
                        "body": new_body,
                        "payload": new_payload,
                    },
                }
            )

        report = {
            "dry_run": dry_run,
            "challenge_id": challenge_id,
            "challenge_state": {
                "winner_id": str(ch["winner_id"]) if ch["winner_id"] else None,
                "challenger_fixture_points": c_pts,
                "challenged_fixture_points": d_pts,
                "stake": stake,
            },
            "audit_logs_to_update": len(audit_updates),
            "notifications_to_update": len(notif_updates),
            "audit_updates": audit_updates,
            "notification_updates": notif_updates,
        }
        print(json.dumps(report, indent=2, default=str))

        if not audit_updates and not notif_updates:
            print("\nNo audit logs or notifications need updating.")
            return

        if dry_run:
            print("\nDRY_RUN=1 — no writes. Set DRY_RUN=0 to apply.")
            return

        async with conn.transaction():
            for item in audit_updates:
                await conn.execute(
                    """
                    UPDATE audit_logs
                    SET detail = $2
                    WHERE id = $1
                    """,
                    uuid.UUID(item["id"]),
                    json.dumps(item["after"], default=str),
                )
            for item in notif_updates:
                after = item["after"]
                await conn.execute(
                    """
                    UPDATE notifications
                    SET title = $2, body = $3, payload = $4
                    WHERE id = $1
                    """,
                    uuid.UUID(item["id"]),
                    after["title"],
                    after["body"],
                    json.dumps(after["payload"], default=str),
                )
            await conn.execute(
                """
                INSERT INTO audit_logs (id, user_id, action, detail, ip_address, created_at)
                VALUES ($1, NULL, $2, $3, NULL, $4)
                """,
                uuid.uuid4(),
                "challenge_audit_trail_repaired",
                json.dumps(
                    {
                        "challenge_id": challenge_id,
                        "audit_logs_updated": len(audit_updates),
                        "notifications_updated": len(notif_updates),
                    },
                    default=str,
                ),
                datetime.now(timezone.utc),
            )

        print("\nAudit trail repair applied successfully.")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
