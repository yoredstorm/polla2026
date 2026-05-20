"use client";
import { useState } from "react";
import {
  useAdminGroups,
  useCreatePolla,
  usePatchGroup,
  useGroupMembers,
  useAddGroupMember,
  useRemoveGroupMember,
  useAdminAllUsers,
  useNonMembers,
  usePendingExtras,
  useConfirmExtra,
  useUploadPaymentQr,
} from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import {
  AdminPaymentSettingsFields,
  AdminPaymentSettingsView,
} from "@/components/payment/AdminPaymentSettings";
import { AdminProofLightbox } from "@/components/payment/AdminProofLightbox";
import type { AdminNonMember } from "@/types/api";

// ── Create form ──────────────────────────────────────────────────────
function CreatePollaForm() {
  const create = useCreatePolla();
  const [name, setName] = useState("Polla Global 2026");
  const [entry, setEntry] = useState("20");
  const [currency, setCurrency] = useState("PEN");
  const [extra, setExtra] = useState("");
  const [maxStake, setMaxStake] = useState("5");
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
        payment_contact_name: paymentContact.trim() || undefined,
        payment_phone: paymentPhone.trim() || undefined,
      });
      if (qrFile && created?.id) {
        await uploadQr.mutateAsync({ groupId: created.id, file: qrFile });
      }
      setQrFile(null);
    } catch (e: any) {
      setError(e?.detail || "Error al crear la polla.");
    }
  }

  return (
    <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-6 max-w-lg">
      <h2 className="font-display text-xl text-white mb-1">Crear la Polla Global</h2>
      <p className="text-xs text-muted mb-5">
        Configura el torneo. Los participantes se agregan manualmente al confirmar el pago.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm text-muted mb-1 block">Nombre de la polla</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted mb-1 block">Entrada al torneo</label>
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

// ── Settings card ────────────────────────────────────────────────────
function PollaSettingsCard({ polla, onSaved }: { polla: any; onSaved: () => void }) {
  const patch = usePatchGroup();
  const [editing, setEditing] = useState(false);
  const [formEntry, setFormEntry] = useState(polla.entry_fee);
  const [formExtra, setFormExtra] = useState(polla.fixed_bet_amount ?? "");
  const [formCurrency, setFormCurrency] = useState(polla.currency ?? "PEN");
  const [formMaxStake, setFormMaxStake] = useState(String(polla.challenge_max_stake ?? 10));
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
          <div>
            <label className="text-xs text-muted mb-1 block">Extra opcional por partido (0 = desactivado)</label>
            <input type="number" min={0} step="0.01" value={formExtra} onChange={(e) => setFormExtra(e.target.value)}
              placeholder="Ej: 5"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent placeholder:text-muted/50" />
          </div>
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

// ── Badge ────────────────────────────────────────────────────────────
function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-background text-[10px] font-bold">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ── Non-members panel ────────────────────────────────────────────────
function PendingEntriesPanel({ pollaId }: { pollaId: string; currency: string }) {
  const { data: nonMembers, isLoading } = useNonMembers(pollaId);
  const addMember = useAddGroupMember();
  const [success, setSuccess] = useState<Record<string, boolean>>({});
  const [lightboxUser, setLightboxUser] = useState<AdminNonMember | null>(null);

  async function confirm(userId: string) {
    try {
      await addMember.mutateAsync({ groupId: pollaId, userId });
      setSuccess((s) => ({ ...s, [userId]: true }));
    } catch { /* already member or other error */ }
  }

  if (isLoading) return <p className="text-muted text-sm">Cargando...</p>;
  if (!nonMembers?.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
        <p className="text-muted text-sm">No hay usuarios pendientes de confirmacion.</p>
        <p className="text-xs text-muted/60 mt-1">Todos los registrados ya estan en la polla o no hay nadie registrado aun.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-muted text-xs uppercase">
            <th className="text-left px-4 py-3">Usuario</th>
            <th className="text-center px-4 py-3">Comprobante</th>
            <th className="text-right px-4 py-3">Se registro</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {nonMembers.map((u) => (
            <tr key={u.user_id} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3">
                <UserDisplayName
                  username={u.username}
                  firstName={u.first_name}
                  lastName={u.last_name}
                />
                {u.has_proof && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    Comprobante
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {u.has_proof ? (
                  <button
                    type="button"
                    onClick={() => setLightboxUser(u)}
                    className="text-xs px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer transition-colors"
                  >
                    Ver
                  </button>
                ) : (
                  <span className="text-xs text-muted">Sin comprobante</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted text-xs">
                {new Date(u.registered_at).toLocaleDateString("es-PE")}
              </td>
              <td className="px-4 py-3 text-right">
                {success[u.user_id] ? (
                  <span className="text-xs text-emerald-400">Agregado</span>
                ) : (
                  <button
                    type="button"
                    title="Válido si el pago llegó por WhatsApp u otro medio"
                    onClick={() => void confirm(u.user_id)}
                    disabled={addMember.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors font-medium cursor-pointer"
                  >
                    Confirmar pago
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lightboxUser && (
        <AdminProofLightbox
          open={!!lightboxUser}
          onClose={() => setLightboxUser(null)}
          groupId={pollaId}
          userId={lightboxUser.user_id}
          username={lightboxUser.username}
          firstName={lightboxUser.first_name}
          lastName={lightboxUser.last_name}
          proofDataUrl={lightboxUser.entry_proof_data_url}
          confirming={addMember.isPending}
          onConfirm={() => {
            void confirm(lightboxUser.user_id).then(() => setLightboxUser(null));
          }}
        />
      )}
    </div>
  );
}

// ── Pending extras panel ─────────────────────────────────────────────
function PendingExtrasPanel({ pollaId, currency }: { pollaId: string; currency: string }) {
  const { data: extras, isLoading } = usePendingExtras(pollaId);
  const confirmExtra = useConfirmExtra();
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});

  async function confirm(betId: string) {
    try {
      const res = await confirmExtra.mutateAsync({ groupId: pollaId, betId });
      setConfirmed((s) => ({ ...s, [betId]: res.prize_pool }));
    } catch { /* already confirmed */ }
  }

  if (isLoading) return <p className="text-muted text-sm">Cargando...</p>;
  if (!extras?.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center">
        <p className="text-muted text-sm">No hay adicionales pendientes de confirmacion.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-muted text-xs uppercase">
            <th className="text-left px-4 py-3">Usuario</th>
            <th className="text-center px-4 py-3">Prediccion extra</th>
            <th className="text-right px-4 py-3">Monto</th>
            <th className="text-right px-4 py-3">Fecha</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {extras.map((ex) => (
            <tr key={ex.bet_id} className="border-b border-white/5 hover:bg-white/5">
              <td className="px-4 py-3">
                <UserDisplayName
                  username={ex.username}
                  firstName={ex.first_name}
                  lastName={ex.last_name}
                />
              </td>
              <td className="px-4 py-3 text-center">
                <span className="font-display text-accent text-base">
                  {ex.predicted_home_score} – {ex.predicted_away_score}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-bold text-accent">
                {currency} {parseFloat(ex.amount).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right text-muted text-xs">
                {new Date(ex.created_at).toLocaleDateString("es-PE")}
              </td>
              <td className="px-4 py-3 text-right">
                {confirmed[ex.bet_id] ? (
                  <span className="text-xs text-emerald-400">Confirmado ✓</span>
                ) : (
                  <button
                    onClick={() => confirm(ex.bet_id)}
                    disabled={confirmExtra.isPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors font-medium"
                  >
                    ✓ Confirmar pago
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Members panel ────────────────────────────────────────────────────
function MembersPanel({ pollaId, currency }: { pollaId: string; currency: string }) {
  const { data: members, isLoading } = useGroupMembers(pollaId);
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const { data: allUsersData } = useAdminAllUsers();
  const allUsers = allUsersData?.data ?? [];

  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(""); setAddSuccess("");
    const trimmed = addInput.trim();
    if (!trimmed) return;
    const user = allUsers.find((u) => u.username.toLowerCase() === trimmed.toLowerCase());
    if (!user) { setAddError(`Usuario "${trimmed}" no encontrado.`); return; }
    try {
      const res = await addMember.mutateAsync({ groupId: pollaId, userId: user.id });
      setAddInput("");
      setAddSuccess(`${user.username} agregado. Pozo: ${currency} ${parseFloat(res.prize_pool).toFixed(2)}`);
      setTimeout(() => setAddSuccess(""), 4000);
    } catch (e: any) {
      setAddError(e?.detail || e?.error?.message || "Error (puede que ya sea miembro).");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="relative flex-1">
          <input list="user-list" value={addInput} onChange={(e) => setAddInput(e.target.value)}
            placeholder="Agregar por username (ej: ppimentel)"
            className="w-full bg-white/5 border border-accent/40 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 placeholder:text-muted/50" />
          <datalist id="user-list">
            {allUsers.map((u) => <option key={u.id} value={u.username} />)}
          </datalist>
        </div>
        <button type="submit" disabled={addMember.isPending || !addInput.trim()}
          className="px-5 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap">
          {addMember.isPending ? "..." : "✓ Confirmar pago"}
        </button>
      </form>
      {addError && <p className="text-danger text-xs">{addError}</p>}
      {addSuccess && <p className="text-emerald-300 text-xs">{addSuccess}</p>}

      {isLoading ? (
        <p className="text-muted text-sm">Cargando participantes...</p>
      ) : members && members.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-muted text-xs uppercase">
                <th className="text-left px-4 py-3">Usuario</th>
                <th className="text-right px-4 py-3">Puntos</th>
                <th className="text-right px-4 py-3">Total apostado</th>
                <th className="text-right px-4 py-3">Desde</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <UserDisplayName
                      username={m.username}
                      firstName={m.first_name}
                      lastName={m.last_name}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-accent">{m.total_points}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {currency} {parseFloat(m.total_amount_bet).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted text-xs">
                    {new Date(m.joined_at).toLocaleDateString("es-PE")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeMember.mutate({ groupId: pollaId, userId: m.user_id })}
                      disabled={removeMember.isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <p className="text-muted text-sm">Sin participantes confirmados aun.</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────
export default function AdminPollaPage() {
  const { data, isLoading, refetch } = useAdminGroups(1, 1);
  const polla = data?.data?.[0] ?? null;

  const { data: nonMembers } = useNonMembers(polla?.id ?? null);
  const { data: pendingExtras } = usePendingExtras(polla?.id ?? null);

  const currency = polla?.currency ?? "PEN";
  const pendingEntryCount = nonMembers?.length ?? 0;
  const pendingExtraCount = pendingExtras?.length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-white">Polla Global</h1>
        <p className="text-sm text-muted mt-1">
          Configura el torneo, define los montos y gestiona quienes participan.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted">Cargando...</p>
      ) : !polla ? (
        <CreatePollaForm />
      ) : (
        <div className="space-y-6">
          {/* Config + Pozo */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PollaSettingsCard polla={polla} onSaved={() => refetch()} />
            <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6">
              <h2 className="font-display text-xl text-white mb-1">Estado del pozo</h2>
              <div className="space-y-3 mt-4">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-muted text-sm">Participantes confirmados</span>
                  <span className="font-bold text-white">{polla.member_count}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-muted text-sm">Entrada por persona</span>
                  <span className="font-bold text-white">{currency} {parseFloat(polla.entry_fee).toFixed(2)}</span>
                </div>
                {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
                  <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <span className="text-muted text-sm">Extra opcional / partido</span>
                    <span className="font-bold text-white">{currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-muted text-sm">Pozo total (confirmado)</span>
                  <span className="font-display text-2xl text-accent">{currency} {parseFloat(polla.prize_pool).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pending entries */}
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">
                Confirmaciones de entrada pendientes
              </h2>
              <Badge count={pendingEntryCount} />
            </div>
            <p className="text-xs text-muted mb-4">
              Usuarios registrados que aun no estan en la polla. Confirma su pago para agregarlos.
            </p>
            <PendingEntriesPanel pollaId={polla.id} currency={currency} />
          </div>

          {/* Pending extras */}
          {polla.fixed_bet_amount && parseFloat(polla.fixed_bet_amount) > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-lg text-white">
                  Adicionales por partido pendientes
                </h2>
                <Badge count={pendingExtraCount} />
              </div>
              <p className="text-xs text-muted mb-4">
                Apuestas con extra ({currency} {parseFloat(polla.fixed_bet_amount).toFixed(2)}) que el usuario eligio agregar. Confirma que recibiste el pago para que sume al pozo.
              </p>
              <PendingExtrasPanel pollaId={polla.id} currency={currency} />
            </div>
          )}

          {/* All confirmed members */}
          <div className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6">
            <h2 className="font-display text-lg text-white mb-1">
              Participantes confirmados{" "}
              <span className="text-muted text-base">({polla.member_count})</span>
            </h2>
            <p className="text-xs text-muted mb-4">
              Busca y agrega manualmente si lo necesitas.
            </p>
            <MembersPanel pollaId={polla.id} currency={currency} />
          </div>
        </div>
      )}
    </div>
  );
}
