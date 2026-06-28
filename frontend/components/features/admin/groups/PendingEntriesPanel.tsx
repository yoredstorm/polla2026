"use client";
import { useState } from "react";
import { useScopedAddGroupMember, useScopedNonMembers } from "@/hooks/admin/useScopedGroupAdmin";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { AdminProofLightbox } from "@/components/features/payment/AdminProofLightbox";
import type { AdminNonMember } from "@/types/api";

export function PendingEntriesPanel({
  pollaId,
  competitionSlug,
}: {
  pollaId: string;
  currency: string;
  competitionSlug?: string;
}) {
  const { data: nonMembers, isLoading } = useScopedNonMembers(pollaId, competitionSlug);
  const addMember = useScopedAddGroupMember(competitionSlug);
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
      <ul className="md:hidden divide-y divide-white/10">
        {nonMembers.map((u) => (
          <li key={u.user_id} className="p-4 space-y-2">
            <UserDisplayName username={u.username} firstName={u.first_name} lastName={u.last_name} />
            <p className="text-xs text-muted">
              Registro: {new Date(u.registered_at).toLocaleDateString("es-PE")}
            </p>
            {success[u.user_id] ? (
              <span className="text-xs text-emerald-400">Agregado</span>
            ) : (
              <button
                type="button"
                onClick={() => void confirm(u.user_id)}
                disabled={addMember.isPending}
                className="w-full min-h-11 text-sm px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 font-medium"
              >
                Confirmar pago
              </button>
            )}
          </li>
        ))}
      </ul>
      <table className="w-full text-sm hidden md:table">
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
