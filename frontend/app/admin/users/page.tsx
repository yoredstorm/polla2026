"use client";
import { useState } from "react";
import { useAdminUsers, usePatchUser } from "@/hooks/useAdmin";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/ui/QueryState";
import type { AdminUserEntry } from "@/types/api";

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminUsers(page, 20);
  const patchUser = usePatchUser();
  const users = data?.data ?? [];
  const totalPages = data?.pagination?.total_pages ?? 1;

  function toggle(userId: string, field: "is_active" | "is_admin", current: boolean) {
    patchUser.mutate({ userId, [field]: !current });
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-white">Gestionar Usuarios</h1>

      <QueryState
        isLoading={isLoading}
        isError={isError}
        isEmpty={users.length === 0}
        onRetry={() => refetch()}
        errorMessage="No se pudieron cargar los usuarios."
        loadingSlot={
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full skeleton-shimmer" />
            ))}
          </div>
        }
        emptySlot={<p className="text-muted">No hay usuarios registrados.</p>}
      >
        <>
          <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm overflow-x-auto hidden md:block">
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
                {users.map((u: AdminUserEntry, i) => (
                  <StaggerItem
                    key={u.id}
                    as="tr"
                    index={Math.min(i, 12)}
                    className="border-b border-white/5 hover:bg-white/5 transition-[background-color,transform] duration-fast ease-entrance hover:-translate-y-px"
                  >
                    <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.is_active}
                        aria-label={`Usuario ${u.username} activo`}
                        onClick={() => toggle(u.id, "is_active", u.is_active)}
                        disabled={patchUser.isPending}
                        className={cn(
                          "min-h-11 min-w-11 w-11 h-6 rounded-full relative transition-[background-color] duration-fast ease-entrance inline-flex items-center",
                          u.is_active ? "bg-emerald-500" : "bg-white/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-fast ease-entrance",
                            u.is_active ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={u.is_admin}
                        aria-label={`Usuario ${u.username} administrador`}
                        onClick={() => toggle(u.id, "is_admin", u.is_admin)}
                        disabled={patchUser.isPending}
                        className={cn(
                          "min-h-11 min-w-11 w-11 h-6 rounded-full relative transition-[background-color] duration-fast ease-entrance inline-flex items-center",
                          u.is_admin ? "bg-accent" : "bg-white/20",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-fast ease-entrance",
                            u.is_admin ? "left-5" : "left-0.5",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{u.total_bets}</td>
                    <td className="px-4 py-3 text-right text-accent font-bold">{u.total_points}</td>
                    <td className="px-4 py-3 text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  </StaggerItem>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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
      </QueryState>
    </div>
  );
}
