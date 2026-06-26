"use client";

import { useEffect, useState, useMemo } from "react";
import {
  getCelebrationPrefs,
  setFavoriteTeam,
  setSoundEnabled,
  setVibrationEnabled,
} from "@/lib/celebrationPrefs";
import { useFixtures } from "@/hooks/useFixtures";

export function CelebrationPreferencesSection() {
  const [sound, setSound] = useState(false);
  const [vibration, setVibration] = useState(false);
  const [favorite, setFavorite] = useState("");
  const { data: fixturesData } = useFixtures({ limit: 100 });
  const teams = useMemo(() => {
    const names = new Set<string>();
    for (const f of fixturesData?.data ?? []) {
      names.add(f.home_team);
      names.add(f.away_team);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [fixturesData]);

  useEffect(() => {
    const prefs = getCelebrationPrefs();
    setSound(prefs.sound);
    setVibration(prefs.vibration);
    setFavorite(prefs.favoriteTeam ?? "");
  }, []);

  return (
    <section className="rounded-xl border border-white/10 bg-glass p-6 space-y-4">
      <div>
        <h2 className="font-display text-lg text-white">Experiencia en vivo</h2>
        <p className="text-sm text-muted mt-1">
          Sonido, vibración y equipo favorito para la fiebre del Mundial.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm text-white">Sonido al marcar gol</span>
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            setSoundEnabled(e.target.checked);
          }}
          className="h-4 w-4 rounded border-white/20"
        />
      </label>

      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm text-white">Vibración en gol (móvil)</span>
        <input
          type="checkbox"
          checked={vibration}
          onChange={(e) => {
            setVibration(e.target.checked);
            setVibrationEnabled(e.target.checked);
          }}
          className="h-4 w-4 rounded border-white/20"
        />
      </label>

      <div>
        <label htmlFor="favorite-team" className="block text-sm text-white mb-2">
          Selección favorita
        </label>
        <select
          id="favorite-team"
          value={favorite}
          onChange={(e) => {
            setFavorite(e.target.value);
            setFavoriteTeam(e.target.value || null);
          }}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        >
          <option value="">Sin preferencia</option>
          {(teams).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
