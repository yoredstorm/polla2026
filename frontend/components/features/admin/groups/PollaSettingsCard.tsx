"use client";
import { useState } from "react";
import { usePatchGroup, useUploadPaymentQr } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import {
  AdminPaymentSettingsFields,
  AdminPaymentSettingsView,
} from "@/components/features/payment/AdminPaymentSettings";
import type { AdminGroupDetail } from "@/types/api";

export function PollaSettingsCard({ polla, onSaved }: { polla: AdminGroupDetail; onSaved: () => void }) {
  const patch = usePatchGroup();
  const [editing, setEditing] = useState(false);
  const [formEntry, setFormEntry] = useState(polla.entry_fee);
  const [formExtra, setFormExtra] = useState(polla.fixed_bet_amount ?? "");
  const [formCurrency, setFormCurrency] = useState(polla.currency ?? "PEN");
  const [formMaxStake, setFormMaxStake] = useState(String(polla.challenge_max_stake ?? 10));
  const [formDailyLimit, setFormDailyLimit] = useState(String(polla.challenge_daily_limit ?? 0));
  const [formTournamentLimit, setFormTournamentLimit] = useState(
    String(polla.challenge_tournament_limit ?? 0),
  );
  const [formChallengesEnabled, setFormChallengesEnabled] = useState(
    polla.challenges_enabled !== false,
  );
  const [formPaymentContact, setFormPaymentContact] = useState(polla.payment_contact_name ?? "");
  const [formPaymentPhone, setFormPaymentPhone] = useState(polla.payment_phone ?? "");
  const [formQrFile, setFormQrFile] = useState<File | null>(null);
  const uploadQr = useUploadPaymentQr();

  function save() {
    const extraVal = formExtra ? parseFloat(formExtra) : 0;
    patch.mutate(
      {
        groupId: polla.id,
        entry_fee: parseFloat(formEntry) || 0,
        currency: formCurrency,
        bet_amount_mode: "single_entry",
        fixed_bet_amount: extraVal,
        challenge_max_stake: Math.max(1, Math.min(20, parseInt(formMaxStake, 10) || 10)),
        challenge_daily_limit: Math.max(0, Math.min(99, parseInt(formDailyLimit, 10) || 0)),
        challenge_tournament_limit: Math.max(0, Math.min(99, parseInt(formTournamentLimit, 10) || 0)),
        challenges_enabled: formChallengesEnabled,
        payment_contact_name: formPaymentContact.trim() || undefined,
        payment_phone: formPaymentPhone.trim() || undefined,
      },
      {
        onSuccess: async () => {
          if (formQrFile) {
            await uploadQr.mutateAsync({ groupId: polla.id, file: formQrFile });
            setFormQrFile(null);
          }
          setEditing(false);
          onSaved();
        },
      },
    );
  }

  const currency = polla.currency ?? "PEN";

  return (
    <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl text-white">{polla.name}</h2>
            <span className={cn("text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium",
              polla.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-muted")}>
              {polla.is_active ? "Activa" : "Inactiva"}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Pozo acumulado: <span className="text-accent font-bold text-sm">{currency} {parseFloat(polla.prize_pool).toFixed(2)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-muted hover:text-white hover:bg-white/10 transition-colors">
            {editing ? "Cancelar" : "Editar config."}
          </button>
          <button onClick={() => patch.mutate({ groupId: polla.id, is_active: !polla.is_active })} disabled={patch.isPending}
            className={cn("text-xs px-3 py-1.5 rounded-lg transition-colors",
              polla.is_active ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
            {polla.is_active ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/10">
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Entrada al torneo</p>
            <p className="text-lg font-bold text-white">{currency} {parseFloat(polla.entry_fee).toFixed(2)}</p>
            <p className="text-xs text-muted">Pago unico por todo el torneo</p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Extra opcional / partido</p>
            {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 ? (
              <>
                <p className="text-lg font-bold text-white">{currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}</p>
                <p className="text-xs text-muted">Admin confirma cada pago</p>
              </>
            ) : (
              <p className="text-sm text-muted">No configurado</p>
            )}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Máximo pts por duelo</p>
            <p className="text-lg font-bold text-white">{polla.challenge_max_stake ?? 10} pts</p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Retos por día</p>
            <p className="text-lg font-bold text-white">
              {(polla.challenge_daily_limit ?? 0) > 0 ? polla.challenge_daily_limit : "Sin límite"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Retos del mundial</p>
            <p className="text-lg font-bold text-white">
              {(polla.challenge_tournament_limit ?? 0) > 0
                ? polla.challenge_tournament_limit
                : "Sin límite"}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted uppercase tracking-wide mb-1">Sistema de retos</p>
            <p className="text-lg font-bold text-white">
              {polla.challenges_enabled !== false ? "Activo" : "Desactivado"}
            </p>
          </div>
          <AdminPaymentSettingsView
            groupId={polla.id}
            paymentContactName={polla.payment_contact_name}
            paymentPhone={polla.payment_phone}
            paymentQrUrl={polla.payment_qr_url}
          />
        </div>
      ) : (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Entrada al torneo</label>
              <input type="number" min={0} step="0.01" value={formEntry} onChange={(e) => setFormEntry(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Moneda</label>
              <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent">
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD</option>
                <option value="CLP">CLP</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Máximo pts por duelo (1–20)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={formMaxStake}
              onChange={(e) => setFormMaxStake(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Retos por día (0 = sin límite)</label>
              <input
                type="number"
                min={0}
                max={99}
                value={formDailyLimit}
                onChange={(e) => setFormDailyLimit(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Retos mundial (0 = sin límite)</label>
              <input
                type="number"
                min={0}
                max={99}
                value={formTournamentLimit}
                onChange={(e) => setFormTournamentLimit(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Extra opcional por partido (0 = desactivado)</label>
            <input type="number" min={0} step="0.01" value={formExtra} onChange={(e) => setFormExtra(e.target.value)}
              placeholder="Ej: 5"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent placeholder:text-muted/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formChallengesEnabled}
              onChange={(e) => setFormChallengesEnabled(e.target.checked)}
              className="accent-accent w-4 h-4"
            />
            <span className="text-sm text-white">Sistema de retos (Te reto) activo</span>
          </label>
          <AdminPaymentSettingsFields
            contactName={formPaymentContact}
            phone={formPaymentPhone}
            onContactNameChange={setFormPaymentContact}
            onPhoneChange={setFormPaymentPhone}
            qrFile={formQrFile}
            onQrFileChange={setFormQrFile}
          />
          <button onClick={save} disabled={patch.isPending}
            className="w-full py-2 rounded-lg bg-accent text-background font-bold text-sm hover:bg-accent-dim disabled:opacity-50 transition-colors">
            {patch.isPending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
