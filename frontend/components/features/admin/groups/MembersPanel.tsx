"use client";
import { useState } from "react";
import {
  useGroupMembers,
  useAddGroupMember,
  useRemoveGroupMember,
  useAdminAllUsers,
} from "@/hooks/useAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { getApiErrorMessage } from "@/lib/challengeUtils";

export function MembersPanel({ pollaId, currency }: { pollaId: string; currency: string }) {
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
    } catch (e: unknown) {
      setAddError(getApiErrorMessage(e, "Error (puede que ya sea miembro)."));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
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
          <ul className="md:hidden divide-y divide-white/10">
            {members.map((m) => (
              <li key={m.user_id} className="p-4 space-y-2">
                <UserDisplayName username={m.username} firstName={m.first_name} lastName={m.last_name} />
                <p className="text-sm text-accent font-bold">{m.total_points} pts</p>
                <p className="text-xs text-muted">
                  {currency} {parseFloat(m.total_amount_bet).toFixed(2)} · desde{" "}
                  {new Date(m.joined_at).toLocaleDateString("es-PE")}
                </p>
                <button
                  type="button"
                  onClick={() => removeMember.mutate({ groupId: pollaId, userId: m.user_id })}
                  disabled={removeMember.isPending}
                  className="w-full min-h-11 text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-400"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <table className="w-full text-sm hidden md:table">
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
