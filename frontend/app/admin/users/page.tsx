"use client";
import { useState } from "react";
import { useAdminUsers, usePatchUser } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminUsers(page, 20);
  const patchUser = usePatchUser();

  function toggle(userId: string, field: "is_active" | "is_admin", current: boolean) {
    patchUser.mutate({ userId, [field]: !current });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Gestionar Usuarios</h1>

      {isLoading ? (
        <p className="text-muted">Cargando usuarios...</p>
      ) : data?.data.length ? (
        <>
          <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-center px-4 py-3">Activo</th>
                  <th className="text-center px-4 py-3">Admin</th>
                  <th className="text-right px-4 py-3">Apuestas</th>
                  <th className="text-right px-4 py-3">Puntos</th>
                  <th className="text-left px-4 py-3">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((u: any) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(u.id, "is_active", u.is_active)}
                        disabled={patchUser.isPending}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors",
                          u.is_active ? "bg-emerald-500" : "bg-white/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                            u.is_active ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(u.id, "is_admin", u.is_admin)}
                        disabled={patchUser.isPending}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors",
                          u.is_admin ? "bg-accent" : "bg-white/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                            u.is_admin ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{u.total_bets}</td>
                    <td className="px-4 py-3 text-right text-accent font-bold">{u.total_points}</td>
                    <td className="px-4 py-3 text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pagination.total_pages > 1 && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: data.pagination.total_pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm transition-colors",
                    page === p ? "bg-accent text-background" : "text-muted hover:bg-white/10",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">No hay usuarios.</p>
      )}
    </div>
  );
}
