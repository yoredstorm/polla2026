"use client";
import { useState } from "react";
import { useCreatePolla, useUploadPaymentQr } from "@/hooks/useAdmin";
import { AdminPaymentSettingsFields } from "@/components/features/payment/AdminPaymentSettings";
import { getApiErrorMessage } from "@/lib/challengeUtils";
import {
  PRIZE_STRUCTURE_OPTIONS,
  type PrizeStructureMode,
} from "@/lib/prizeStructure";

export function CreatePollaForm() {
  const create = useCreatePolla();
  const [prizeMode, setPrizeMode] = useState<PrizeStructureMode>("full_milestones");
  const [name, setName] = useState("Polla Global 2026");
  const [entry, setEntry] = useState("20");
  const [currency, setCurrency] = useState("PEN");
  const [extra, setExtra] = useState("");
  const [maxStake, setMaxStake] = useState("5");
  const [dailyLimit, setDailyLimit] = useState("3");
  const [tournamentLimit, setTournamentLimit] = useState("30");
  const [challengesEnabled, setChallengesEnabled] = useState(true);
  const [paymentContact, setPaymentContact] = useState("Tesorería Polla 2026");
  const [paymentPhone, setPaymentPhone] = useState("+51 999 888 777");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const uploadQr = useUploadPaymentQr();
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !entry) { setError("Nombre y monto de entrada son requeridos."); return; }
    const entryNum = parseFloat(entry) || 0;
    if (entryNum > 0 && (!paymentContact.trim() || !paymentPhone.trim())) {
      setError("Nombre del titular y teléfono son requeridos cuando hay entrada.");
      return;
    }
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        entry_fee: entryNum,
        currency,
        per_match_amount: extra ? parseFloat(extra) : undefined,
        challenge_max_stake: Math.max(1, Math.min(20, parseInt(maxStake, 10) || 5)),
        challenge_daily_limit: Math.max(0, Math.min(99, parseInt(dailyLimit, 10) || 0)),
        challenge_tournament_limit: Math.max(0, Math.min(99, parseInt(tournamentLimit, 10) || 0)),
        challenges_enabled: challengesEnabled,
        payment_contact_name: paymentContact.trim() || undefined,
        payment_phone: paymentPhone.trim() || undefined,
        prize_structure_mode: prizeMode,
      });
      if (qrFile && created?.id) {
        await uploadQr.mutateAsync({ groupId: created.id, file: qrFile });
      }
      setQrFile(null);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Error al crear la polla."));
    }
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-6 max-w-lg">
      <h2 className="font-display text-xl text-white mb-1">Crear la Polla Global</h2>
      <p className="text-xs text-muted mb-5">
        Configura el torneo. Los participantes se agregan manualmente al confirmar el pago.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted mb-2 block">Estructura de premios</legend>
          {PRIZE_STRUCTURE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                prizeMode === opt.value
                  ? "border-accent/50 bg-accent/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="prize_structure_mode"
                value={opt.value}
                checked={prizeMode === opt.value}
                onChange={() => setPrizeMode(opt.value)}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="text-sm font-medium text-white block">{opt.title}</span>
                <span className="text-xs text-muted">{opt.description}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted">
            No se puede cambiar después de crear la polla.
          </p>
        </fieldset>
        <div>
          <label className="text-sm text-muted mb-1 block">Nombre de la polla</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Entrada del primer hito</label>
            <input type="number" min={0} step="0.01" value={entry} onChange={(e) => setEntry(e.target.value)} required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Moneda</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent">
              <option value="PEN">PEN (Soles)</option>
              <option value="USD">USD (Dolares)</option>
              <option value="CLP">CLP (Pesos)</option>
              <option value="ARS">ARS (Pesos Arg.)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">
            Extra opcional por partido <span className="text-muted/60">(deja en blanco = desactivado)</span>
          </label>
          <input type="number" min={0} step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)}
            placeholder="Ej: 5"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent placeholder:text-muted/50" />
          <p className="text-xs text-muted mt-1">
            Participantes pueden agregar este monto al apostar; el admin confirma el pago.
          </p>
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">Máximo pts por duelo (Te reto)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxStake}
            onChange={(e) => setMaxStake(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-muted mt-1">
            Evita transferencias de puntos entre amigos; además cada jugador solo puede apostar hasta el 50% de sus puntos disponibles.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Retos por día</label>
            <input
              type="number"
              min={0}
              max={99}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-muted mt-1">0 = sin límite. Se reinicia a medianoche.</p>
          </div>
          <div>
            <label className="text-sm text-muted mb-1 block">Retos totales (mundial)</label>
            <input
              type="number"
              min={0}
              max={99}
              value={tournamentLimit}
              onChange={(e) => setTournamentLimit(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-muted mt-1">0 = sin límite en todo el torneo.</p>
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={challengesEnabled}
            onChange={(e) => setChallengesEnabled(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-white">Sistema de retos (Te reto) activo</span>
        </label>
        <p className="text-xs text-muted -mt-2">
          Desactivalo en fases finales (cuartos, semifinal, final) si no quieres duelos 1v1.
        </p>
        <AdminPaymentSettingsFields
          contactName={paymentContact}
          phone={paymentPhone}
          onContactNameChange={setPaymentContact}
          onPhoneChange={setPaymentPhone}
          qrFile={qrFile}
          onQrFileChange={setQrFile}
        />
        {error && <p className="text-danger text-xs">{error}</p>}
        <button type="submit" disabled={create.isPending}
          className="w-full py-3 rounded-xl bg-accent text-background font-bold hover:bg-accent-dim disabled:opacity-50 transition-colors">
          {create.isPending ? "Creando..." : "Crear Polla"}
        </button>
      </form>
    </div>
  );
}
