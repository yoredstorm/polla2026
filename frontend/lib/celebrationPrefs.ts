const SOUND_KEY = "polla_sound_enabled";
const VIBRATION_KEY = "polla_vibration_enabled";
const FAVORITE_TEAM_KEY = "polla_favorite_team";

export interface CelebrationPrefs {
  sound: boolean;
  vibration: boolean;
  favoriteTeam: string | null;
}

export function getCelebrationPrefs(): CelebrationPrefs {
  if (typeof window === "undefined") {
    return { sound: false, vibration: false, favoriteTeam: null };
  }
  return {
    sound: localStorage.getItem(SOUND_KEY) === "true",
    vibration: localStorage.getItem(VIBRATION_KEY) === "true",
    favoriteTeam: localStorage.getItem(FAVORITE_TEAM_KEY),
  };
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem(SOUND_KEY, String(enabled));
}

export function setVibrationEnabled(enabled: boolean) {
  localStorage.setItem(VIBRATION_KEY, String(enabled));
}

export function setFavoriteTeam(team: string | null) {
  if (team) localStorage.setItem(FAVORITE_TEAM_KEY, team);
  else localStorage.removeItem(FAVORITE_TEAM_KEY);
}
