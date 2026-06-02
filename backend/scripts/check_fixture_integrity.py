"""Check betting_open vs is_locked integrity on fixtures."""
import asyncio
import os

import asyncpg

FIXTURE_ID = "cc114879-f93c-4831-a1d2-d426d5f825e8"


async def main() -> None:
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://polla_user:OI-BLyqXLaEhgfSaFEitMzLi385SMCJv@postgres:5432/polla_db",
    ).replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(url)

    row = await conn.fetchrow(
        """
        SELECT id, home_team, away_team, match_date, status,
               is_locked, betting_open, round
        FROM fixtures WHERE id = $1
        """,
        FIXTURE_ID,
    )
    print("=== Target fixture ===")
    print(dict(row) if row else "NOT FOUND")

    inconsistent = await conn.fetch(
        """
        SELECT id, home_team, away_team, match_date, is_locked, betting_open
        FROM fixtures
        WHERE status = 'scheduled'
          AND betting_open = true
          AND is_locked = true
        ORDER BY match_date
        """
    )
    print(f"\n=== scheduled + betting_open=true + is_locked=true ({len(inconsistent)}) ===")
    for r in inconsistent:
        print(dict(r))

    opposite = await conn.fetch(
        """
        SELECT id, home_team, away_team, match_date, is_locked, betting_open
        FROM fixtures
        WHERE status = 'scheduled'
          AND betting_open = false
          AND is_locked = false
          AND match_date > NOW() + interval '2 minutes'
        ORDER BY match_date
        """
    )
    print(f"\n=== scheduled + betting_open=false + is_locked=false + future ({len(opposite)}) ===")
    for r in opposite:
        print(dict(r))

    locked_future = await conn.fetch(
        """
        SELECT id, home_team, away_team, match_date, is_locked, betting_open
        FROM fixtures
        WHERE status = 'scheduled'
          AND is_locked = true
          AND match_date > NOW() + interval '2 minutes'
        ORDER BY match_date
        """
    )
    print(f"\n=== scheduled + is_locked=true + kickoff in future ({len(locked_future)}) ===")
    for r in locked_future:
        print(dict(r))

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
