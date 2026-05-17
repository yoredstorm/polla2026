"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import {
  useCreateChallenge,
  useChallengeAvailablePoints,
  useChallengeOpponents,
  type ChallengeOpponent,
} from "@/hooks/useChallenges";
import { useToast } from "@/components/ui/Toast";
import { ChallengeRules } from "@/components/betting/ChallengeRules";
import { getApiErrorMessage, maxStakeForUser } from "@/lib/challengeUtils";
import { cn } from "@/lib/utils";

interface ChallengeModalProps {
  fixtureId: string;
  open: boolean;
  onClose: () => void;
}

export function ChallengeModal({ fixtureId, open, onClose }: ChallengeModalProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ChallengeOpponent | null>(null);
  const [stake, setStake] = useState(1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: pts } = useChallengeAvailablePoints();
  const { data: opponents } = useChallengeOpponents(query);
  const create = useCreateChallenge();
  const toast = useToast((s) => s.add);

  const myMax =
    pts?.effective_max ??
    maxStakeForUser(
      pts?.available ?? 0,
      pts?.max_stake ?? 10,
      pts?.max_by_balance,
    );
  const rivalMax = selected?.available_for_challenge ?? 0;
  const effectiveMax = Math.min(myMax, rivalMax > 0 ? rivalMax : myMax);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setStake(1);
    }
  }, [open]);

  useEffect(() => {
    if (stake > effectiveMax && effectiveMax > 0) {
      setStake(effectiveMax);
    }
  }, [effectiveMax, stake]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const username = selected?.username ?? query.trim();
    if (!username) {
      toast("Elige un rival de la lista", "error");
      return;
    }
    if (stake > myMax) {
      toast("No tienes puntos suficientes", "error");
      return;
    }
    if (selected && stake > selected.available_for_challenge) {
      toast(`@${selected.username} solo puede apostar hasta ${selected.available_for_challenge} pts`, "error");
      return;
    }
    try {
      await create.mutateAsync({
        fixture_id: fixtureId,
        challenged_username: username,
        stake_points: stake,
      });
      toast("Reto enviado", "success");
      onClose();
    } catch (err: unknown) {
      toast(getApiErrorMessage(err, "Error al crear reto"), "error");
    }
  }

  function pickOpponent(o: ChallengeOpponent) {
    setSelected(o);
    setQuery(o.username);
    setShowSuggestions(false);
    const cap = Math.min(myMax, o.available_for_challenge);
    if (cap > 0 && stake > cap) setStake(cap);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <form
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="font-display text-2xl text-white text-center">Te reto</h2>

        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center flex-1">
              <div className="w-12 h-12 rounded-full bg-accent/20 border-2 border-accent flex items-center justify-center font-display text-lg text-accent">
                {(user?.username ?? "?").charAt(0).toUpperCase()}
              </div>
              <p className="text-sm text-accent mt-1 truncate max-w-[100px]">@{user?.username}</p>
              {pts != null && (
                <p className="text-[10px] text-muted mt-0.5">{pts.available} disp.</p>
              )}
            </div>
            <motion.span
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="font-display text-3xl text-white"
            >
              VS
            </motion.span>
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center font-display text-lg",
                  selected ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/5 text-muted",
                )}
              >
                {(selected?.username ?? "?").charAt(0).toUpperCase()}
              </div>
              <p className="text-sm text-white mt-1 truncate max-w-[100px]">
                {selected ? `@${selected.username}` : "Rival"}
              </p>
              {selected && (
                <p className="text-[10px] text-muted mt-0.5">{selected.available_for_challenge} disp.</p>
              )}
            </div>
          </div>
          <p className="text-center font-display text-xl text-accent mt-3">{stake} pts en juego</p>
        </div>

        <ChallengeRules compact />

        <div ref={listRef} className="relative">
          <label className="text-xs text-muted block mb-1">Buscar rival (min. 2 letras)</label>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
            placeholder="ej. ppimentel"
            autoComplete="off"
          />
          {showSuggestions && opponents && opponents.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 rounded-lg border border-white/10 bg-surface shadow-xl max-h-40 overflow-y-auto">
              {opponents.map((o) => (
                <li key={o.username}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 flex justify-between gap-2"
                    onClick={() => pickOpponent(o)}
                  >
                    <span className="text-white">@{o.username}</span>
                    <span className="text-muted text-xs">{o.available_for_challenge} pts disp.</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">
            Puntos en juego (max {effectiveMax || myMax})
          </label>
          <input
            type="number"
            min={1}
            max={effectiveMax || myMax || 1}
            value={stake}
            onChange={(e) => setStake(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
          />
          {pts != null && (
            <p className="text-xs text-muted mt-1">
              Tu maximo: {myMax} pts
              {selected ? ` · Rival: ${selected.available_for_challenge} pts` : ""}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending || effectiveMax < 1}
            className="px-4 py-2 rounded-xl bg-accent text-background font-bold text-sm disabled:opacity-50"
          >
            Enviar reto
          </button>
        </div>
      </form>
    </div>
  );
}
