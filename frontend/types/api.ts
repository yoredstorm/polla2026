export type BetsProfileVisibility = "public" | "invite_only";

export interface User {
  id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  is_active: boolean;
  is_verified: boolean;
  is_admin?: boolean;
  created_at: string;
  bets_profile_visibility?: BetsProfileVisibility;
  has_bets_profile_invite_code?: boolean;
  show_bet_amounts?: boolean;
  avatar_preset?: string | null;
  avatar_url?: string | null;
  avatar_display?: string | null;
}

export interface PublicUserSummary {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  bets_profile_visibility: BetsProfileVisibility;
  total_bets: number | null;
  show_bet_amounts?: boolean;
  avatar_preset?: string | null;
  avatar_url?: string | null;
  avatar_display?: string | null;
}

export interface ActivePolla {
  id: string;
  name: string;
  entry_fee: string;
  prize_pool: string;
  currency: string;
  per_match_amount: string | null;
  is_member: boolean;
  member_count: number;
  payment_contact_name?: string | null;
  payment_phone?: string | null;
  payment_qr_url?: string | null;
  /** Base64 data URL — avoids a second cross-origin fetch for the QR image */
  payment_qr_data_url?: string | null;
  has_uploaded_proof?: boolean;
}

export interface AdminNonMember {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  registered_at: string;
  has_proof: boolean;
  proof_uploaded_at: string | null;
  entry_proof_data_url?: string | null;
}

export interface BetsProfileMeResponse {
  bets_profile_visibility: BetsProfileVisibility;
  has_invite_code: boolean;
  new_invite_code: string | null;
}

export type FixtureStatus = "scheduled" | "live" | "finished" | "cancelled";

export interface Fixture {
  id: string;
  external_id: number;
  home_team: string;
  away_team: string;
  home_logo_url: string | null;
  away_logo_url: string | null;
  league_name: string;
  league_id: number;
  league_logo_url: string | null;
  match_date: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  round: string | null;
  group_name: string | null;
  venue: string | null;
  season: number;
  is_locked: boolean;
  betting_open: boolean;
  betting_closes_at?: string | null;
  change_request_closes_at?: string | null;
  admin_resolve_closes_at?: string | null;
}

export interface Bet {
  id: string;
  user_id: string;
  fixture_id: string;
  group_id: string | null;
  predicted_home_score: number;
  predicted_away_score: number;
  amount: string;
  amount_confirmed: boolean;
  points_earned: number | null;
  is_locked: boolean;
  created_at: string;
  /** Present on GET /bets/my-bets (joined fixture metadata). */
  fixture_match_date?: string;
  fixture_home_team?: string;
  fixture_away_team?: string;
  fixture_status?: FixtureStatus | string;
}

/** Group bet list includes username from API */
export interface BetWithUser extends Bet {
  username: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface GroupFixtureStandingEntry {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  predicted_home_score: number;
  predicted_away_score: number;
  points_earned: number | null;
  amount: string;
}

export type BetAmountMode = "single_entry" | "per_bet";

export interface Group {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  max_members: number;
  entry_fee: string;
  prize_pool: string;
  currency: string;
  bet_amount_mode: BetAmountMode;
  fixed_bet_amount: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number | null;
}

export interface GroupMember {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  joined_at: string;
  total_points: number;
  total_amount_bet: string;
}

export interface BadgeOut {
  id: string;
  label: string;
  description: string;
}

export interface LeaderboardEntry {
  position: number;
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_preset?: string | null;
  avatar_url?: string | null;
  avatar_display?: string | null;
  total_points: number;
  total_bets: number;
  correct_results: number;
  accuracy_pct: number;
  wrong_results?: number;
  miss_pct?: number;
  bets_profile_visibility?: "public" | "invite_only";
  wager_count?: number;
  show_bet_amounts?: boolean;
  total_wagered?: string;
  bet_points?: number;
  challenge_pts_won?: number;
  challenge_pts_lost?: number;
  challenge_pts_net?: number;
  challenges_won?: number;
  challenges_lost?: number;
  challenges_active?: number;
  badges?: BadgeOut[];
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    detail?: string;
  };
}

export interface BetCreate {
  fixture_id: string;
  group_id?: string;
  predicted_home_score: number;
  predicted_away_score: number;
  amount?: number;
}

export interface AdminStats {
  total_users: number;
  total_bets: number;
  pending_bets: number;
  finished_fixtures: number;
  total_prize_pools: string;
}

export interface AdminFixture extends Fixture {
  bet_count: number;
}

export interface SettleResult {
  settled_count: number;
  fixture: Fixture;
}

export interface AdminUserEntry {
  id: string;
  username: string;
  is_active: boolean;
  is_admin: boolean;
  total_bets: number;
  total_points: number;
  created_at: string;
}

export interface AdminGroupEntry extends Group {
  member_count_actual: number;
}

export interface FixtureFilter {
  group_name?: string;
  date_from?: string;
  date_to?: string;
  status?: FixtureStatus;
  exclude_finished?: boolean;
  page?: number;
  limit?: number;
}

export type NotificationType =
  | "change_request_resolved"
  | "change_request_pending"
  | "extra_bet_pending"
  | "entry_pending"
  | "fixture_finished"
  | "change_request_expired"
  | "change_request_expired_batch"
  | "badge_earned"
  | "challenge_pending"
  | "challenge_accepted"
  | "challenge_settled"
  | "comment_mention";

export interface NotificationPayload {
  request_id?: string;
  bet_id?: string;
  group_id?: string;
  user_id?: string;
  fixture_id?: string;
  username?: string;
  status?: string;
  request_type?: string;
  admin_notes?: string | null;
  amount?: string;
  home_team?: string;
  away_team?: string;
  home_score?: number;
  away_score?: number;
  badge_id?: string;
  badge_label?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: NotificationPayload | null;
  read_at: string | null;
  created_at: string;
}
