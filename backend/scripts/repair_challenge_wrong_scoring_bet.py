"""
Repair a wrongly settled 1v1 challenge when the winner was picked using a global
free bet instead of the paid extra / group bet.

Bug: settle_challenges_for_fixture used get_scoring_bet_for_fixture (max points
across ALL bets). Users with a global free exact-score bet + paid extra on the
same fixture could win the duel unfairly.

Usage (production — dry run first):
  DRY_RUN=1 DATABASE_URL=postgresql://... python backend/scripts/repair_challenge_wrong_scoring_bet.py

Apply fix:
  DRY_RUN=0 DATABASE_URL=postgresql://... python backend/scripts/repair_challenge_wrong_scoring_bet.py

Optional env:
  CHALLENGER_USERNAME=ppimentel
  CHALLENGED_USERNAME=dvicente
  HOME_TEAM=South Korea
  AWAY_TEAM=Czech Republic
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal


def _pick_best_bet(rows: list[dict]) -> dict | None:
    if not rows:
        return None
    with_pts = [r for r in rows if r["points_earned"] is not None]
    if with_pts:
        return max(with_pts, key=lambda r: (r["points_earned"] or 0, r["created_at"]))
    return min(rows, key=lambda r: r["created_at"])


def challenge_scoring_bet(
    bets: list[dict],
    *,
    group_id: uuid.UUID,
) -> dict | None:
    eligible = [b for b in bets if b["cancelled_at"] is None]
    if not eligible:
        return None

    paid_group = [
        b
        for b in eligible
        if b["group_id"] == group_id and b["amount"] is not None and Decimal(str(b["amount"])) > 0
    ]
    picked = _pick_best_bet(paid_group)
    if picked:
        return picked

    free_group = [
        b
        for b in eligible
        if b["group_id"] == group_id
        and (b["amount"] is None or Decimal(str(b["amount"])) <= 0)
    ]
    picked = _pick_best_bet(free_group)
    if picked:
        return picked

    global_free = [b for b in eligible if b["group_id"] is None]
    return _pick_best_bet(global_free)


def settlement_member_deltas(
    *,
    winner_id: uuid.UUID | None,
    challenger_id: uuid.UUID,
    challenged_id: uuid.UUID,
    c_pts: int,
    d_pts: int,
    stake: int,
) -> tuple[int, int]:
    """Points added to challenger / challenged members at settle (after accept debits)."""
    if winner_id is None:
        return stake + c_pts, stake + d_pts
    if winner_id == challenger_id:
        ch = 2 * stake + c_pts
        cd = -d_pts if d_pts > 0 else 0
        return ch, cd
    cd = 2 * stake + d_pts
    ch = -c_pts if c_pts > 0 else 0
    return ch, cd


def stake_transfer_only_adjustment(
    *,
    wrong_winner_id: uuid.UUID | None,
    challenger_id: uuid.UUID,
    stake: int,
) -> tuple[int, int]:
    """
    Undo only the opponent stake wrongly awarded to the winner.

    Keeps legitimate fixture points from other bets (e.g. global free exact score)
    that were incorrectly bundled into the challenge win.
    """
    if wrong_winner_id is None:
        return 0, 0
    if wrong_winner_id == challenger_id:
        return -stake, stake
    return stake, -stake


async def main() -> None:
    import asyncpg

    dry_run = os.environ.get("DRY_RUN", "1") != "0"
    challenger_username = os.environ.get("CHALLENGER_USERNAME", "ppimentel")
    challenged_username = os.environ.get("CHALLENGED_USERNAME", "dvicente")
    home_team = os.environ.get("HOME_TEAM", "South Korea")
    away_team = os.environ.get("AWAY_TEAM", "Czech Republic")

    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    url = url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(url)
    try:
        users = await conn.fetch(
            """
            SELECT id, username FROM users
            WHERE username IN ($1, $2)
            """,
            challenger_username,
            challenged_username,
        )
        by_name = {r["username"]: r["id"] for r in users}
        if challenger_username not in by_name or challenged_username not in by_name:
            raise SystemExit(f"Users not found: {by_name}")

        challenger_id = by_name[challenger_username]
        challenged_id = by_name[challenged_username]

        fixture = await conn.fetchrow(
            """
            SELECT id, home_team, away_team, home_score, away_score, status
            FROM fixtures
            WHERE home_team ILIKE $1 AND away_team ILIKE $2
            ORDER BY match_date DESC
            LIMIT 1
            """,
            f"%{home_team}%",
            f"%{away_team}%",
        )
        if not fixture:
            raise SystemExit(f"Fixture not found: {home_team} vs {away_team}")

        challenge = await conn.fetchrow(
            """
            SELECT c.*,
                   uc.username AS challenger_username,
                   ud.username AS challenged_username
            FROM challenges c
            JOIN users uc ON uc.id = c.challenger_id
            JOIN users ud ON ud.id = c.challenged_id
            WHERE c.fixture_id = $1
              AND c.status = 'settled'
              AND (
                (c.challenger_id = $2 AND c.challenged_id = $3)
                OR (c.challenger_id = $3 AND c.challenged_id = $2)
              )
            ORDER BY c.settled_at DESC NULLS LAST
            LIMIT 1
            """,
            fixture["id"],
            challenger_id,
            challenged_id,
        )
        if not challenge:
            raise SystemExit("No settled challenge found for these users and fixture")

        bets = await conn.fetch(
            """
            SELECT id, user_id, group_id, predicted_home_score, predicted_away_score,
                   amount, amount_confirmed, points_earned, cancelled_at, created_at
            FROM bets
            WHERE fixture_id = $1
              AND user_id IN ($2, $3)
            ORDER BY created_at
            """,
            fixture["id"],
            challenger_id,
            challenged_id,
        )
        bets_by_user: dict[uuid.UUID, list[dict]] = {challenger_id: [], challenged_id: []}
        for row in bets:
            bets_by_user[row["user_id"]].append(dict(row))

        group_id = challenge["group_id"]
        c_bet = challenge_scoring_bet(bets_by_user[challenger_id], group_id=group_id)
        d_bet = challenge_scoring_bet(bets_by_user[challenged_id], group_id=group_id)
        c_pts = int(c_bet["points_earned"] or 0) if c_bet else 0
        d_pts = int(d_bet["points_earned"] or 0) if d_bet else 0
        stake = int(challenge["stake_points"])

        if c_pts > d_pts:
            correct_winner_id = challenger_id
        elif d_pts > c_pts:
            correct_winner_id = challenged_id
        else:
            correct_winner_id = None

        wrong_winner_id = challenge["winner_id"]
        wrong_c_pts = int(challenge["challenger_fixture_points"] or 0)
        wrong_d_pts = int(challenge["challenged_fixture_points"] or 0)

        # When the wrong winner only won because a different bet tier inflated
        # fixture points, ranking fix is stake-only (-1 / +1), not a full replay.
        inflated_fixture_pts = (
            wrong_winner_id is not None
            and correct_winner_id is None
            and c_pts == 0
            and d_pts == 0
            and (
                wrong_c_pts != c_pts
                or wrong_d_pts != d_pts
            )
        )
        if inflated_fixture_pts:
            adj_ch, adj_cd = stake_transfer_only_adjustment(
                wrong_winner_id=wrong_winner_id,
                challenger_id=challenge["challenger_id"],
                stake=stake,
            )
            adjustment_mode = "stake_transfer_only"
        else:
            wrong_ch, wrong_cd = settlement_member_deltas(
                winner_id=wrong_winner_id,
                challenger_id=challenge["challenger_id"],
                challenged_id=challenge["challenged_id"],
                c_pts=wrong_c_pts,
                d_pts=wrong_d_pts,
                stake=stake,
            )
            correct_ch, correct_cd = settlement_member_deltas(
                winner_id=correct_winner_id,
                challenger_id=challenge["challenger_id"],
                challenged_id=challenge["challenged_id"],
                c_pts=c_pts,
                d_pts=d_pts,
                stake=stake,
            )
            adj_ch = correct_ch - wrong_ch
            adj_cd = correct_cd - wrong_cd
            adjustment_mode = "full_resettlement_delta"

        members = await conn.fetch(
            """
            SELECT user_id, total_points FROM group_members
            WHERE group_id = $1 AND user_id IN ($2, $3)
            """,
            group_id,
            challenge["challenger_id"],
            challenge["challenged_id"],
        )
        totals = {r["user_id"]: int(r["total_points"]) for r in members}

        report = {
            "dry_run": dry_run,
            "adjustment_mode": adjustment_mode,
            "duel_result_after_fix": "draw",
            "fixture": dict(fixture),
            "challenge_id": str(challenge["id"]),
            "stake": stake,
            "stored": {
                "winner_id": str(wrong_winner_id) if wrong_winner_id else None,
                "challenger_fixture_points": wrong_c_pts,
                "challenged_fixture_points": wrong_d_pts,
            },
            "correct": {
                "winner_id": str(correct_winner_id) if correct_winner_id else None,
                "challenger_fixture_points": c_pts,
                "challenged_fixture_points": d_pts,
                "challenger_bet": _bet_summary(c_bet),
                "challenged_bet": _bet_summary(d_bet),
            },
            "member_adjustments": {
                challenger_username: {
                    "current_total": totals.get(challenge["challenger_id"]),
                    "delta": adj_ch,
                    "new_total": totals.get(challenge["challenger_id"], 0) + adj_ch,
                },
                challenged_username: {
                    "current_total": totals.get(challenge["challenged_id"]),
                    "delta": adj_cd,
                    "new_total": totals.get(challenge["challenged_id"], 0) + adj_cd,
                },
            },
            "all_bets": [
                {
                    "username": challenger_username
                    if b["user_id"] == challenger_id
                    else challenged_username,
                    **_bet_summary(b),
                }
                for b in bets
            ],
        }
        print(json.dumps(report, indent=2, default=str))

        needs_fix = (
            wrong_winner_id != correct_winner_id
            or wrong_c_pts != c_pts
            or wrong_d_pts != d_pts
            or adj_ch != 0
            or adj_cd != 0
        )
        if not needs_fix:
            print("\nNo changes required.")
            return

        if dry_run:
            print("\nDRY_RUN=1 — no writes. Set DRY_RUN=0 to apply.")
            return

        async with conn.transaction():
            await conn.execute(
                """
                UPDATE challenges
                SET winner_id = $2,
                    challenger_fixture_points = $3,
                    challenged_fixture_points = $4
                WHERE id = $1
                """,
                challenge["id"],
                correct_winner_id,
                c_pts,
                d_pts,
            )
            if adj_ch:
                await conn.execute(
                    """
                    UPDATE group_members
                    SET total_points = GREATEST(0, total_points + $3)
                    WHERE group_id = $1 AND user_id = $2
                    """,
                    group_id,
                    challenge["challenger_id"],
                    adj_ch,
                )
            if adj_cd:
                await conn.execute(
                    """
                    UPDATE group_members
                    SET total_points = GREATEST(0, total_points + $3)
                    WHERE group_id = $1 AND user_id = $2
                    """,
                    group_id,
                    challenge["challenged_id"],
                    adj_cd,
                )
            await conn.execute(
                """
                INSERT INTO audit_logs (id, user_id, action, detail, ip_address, created_at)
                VALUES ($1, NULL, $2, $3, NULL, $4)
                """,
                uuid.uuid4(),
                "challenge_settlement_repaired",
                json.dumps(
                    {
                        "challenge_id": str(challenge["id"]),
                        "fixture_id": str(fixture["id"]),
                        "reason": "wrong_scoring_bet_tier",
                        "adjustments": report["member_adjustments"],
                        "correct_winner_id": str(correct_winner_id)
                        if correct_winner_id
                        else None,
                    },
                    default=str,
                ),
                datetime.now(timezone.utc),
            )

        print("\nRepair applied successfully.")
    finally:
        await conn.close()


def _bet_summary(bet: dict | None) -> dict | None:
    if not bet:
        return None
    return {
        "bet_id": str(bet["id"]),
        "group_id": str(bet["group_id"]) if bet["group_id"] else None,
        "prediction": f"{bet['predicted_home_score']}-{bet['predicted_away_score']}",
        "amount": str(bet["amount"]),
        "points_earned": bet["points_earned"],
        "created_at": bet["created_at"].isoformat() if bet.get("created_at") else None,
    }


if __name__ == "__main__":
    asyncio.run(main())
