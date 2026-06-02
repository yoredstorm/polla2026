"""
Tests for bet scoring logic — unit tests, no DB required.
"""
from app.services.bet_service import calculate_points


class TestCalculatePoints:
    def test_exact_score_returns_2(self):
        assert calculate_points(2, 1, 2, 1) == 2

    def test_exact_score_zero_zero(self):
        assert calculate_points(0, 0, 0, 0) == 2

    def test_correct_winner_home_returns_1(self):
        assert calculate_points(1, 0, 3, 1) == 1

    def test_correct_winner_away_returns_1(self):
        assert calculate_points(0, 1, 0, 3) == 1

    def test_correct_draw_returns_1(self):
        assert calculate_points(1, 1, 2, 2) == 1

    def test_wrong_prediction_returns_0(self):
        assert calculate_points(2, 1, 0, 2) == 0

    def test_draw_predicted_away_win_is_zero(self):
        assert calculate_points(1, 1, 1, 2) == 0

    def test_correct_diff_but_not_exact_gives_1(self):
        # 2-0 predicted, 4-2 real: same diff (+2) but not exact; same winner (home) -> 1
        assert calculate_points(2, 0, 4, 2) == 1

    def test_exact_beats_winner(self):
        assert calculate_points(3, 1, 3, 1) == 2


class TestPrizeDistribution:
    def test_single_winner_gets_full_pool(self):
        from decimal import Decimal
        from types import SimpleNamespace
        from app.services.bet_service import allocate_first_place_prizes

        pool = Decimal("30.00")
        lb = [
            SimpleNamespace(total_points=10, position=1),
            SimpleNamespace(total_points=5, position=2),
        ]
        out = allocate_first_place_prizes(lb, pool)
        assert len(out) == 1
        assert out[0][1] == Decimal("30.00")

    def test_tied_first_place_splits_pool(self):
        from decimal import Decimal
        from types import SimpleNamespace
        from app.services.bet_service import allocate_first_place_prizes

        pool = Decimal("30.00")
        lb = [
            SimpleNamespace(total_points=10, position=1),
            SimpleNamespace(total_points=10, position=2),
            SimpleNamespace(total_points=3, position=3),
        ]
        out = allocate_first_place_prizes(lb, pool)
        assert len(out) == 2
        assert sum(a for _, a in out) == pool
        assert out[0][1] == Decimal("15.00")
        assert out[1][1] == Decimal("15.00")
