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
    def test_prize_distribution(self):
        from decimal import Decimal
        from app.services.bet_service import calculate_prize_distribution

        pool = Decimal("1000.00")
        dist = calculate_prize_distribution(pool)
        assert dist[1] == Decimal("600.00")
        assert dist[2] == Decimal("300.00")
        assert dist[3] == Decimal("100.00")
        assert dist[1] + dist[2] + dist[3] == pool
