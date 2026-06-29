"use client";
import { useState } from "react";
import { useAdminUsers, usePatchUser } from "@/hooks/useAdmin";
import { StaggerItem } from "@/components/ui/StaggerItem";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/ui/QueryState";
import { AdminToggleSwitch } from "@/components/common/AdminToggleSwitch";
import type { AdminUserEntry } from "@/types/api";

function UserPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPage(p)}
          className={cn(
            "w-8 h-8 rounded-lg text-sm transition-colors",
            page === p ? "bg-accent text-background" : "text-muted hover:bg-white/10",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function UserAdminControls({
  user,
  onToggle,
  disabled,
}: {
  user: AdminUserEntry;
  onToggle: (field: "is_active" | "is_admin", current: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Activo</span>
        <AdminToggleSwitch
          checked={user.is_active}
          onChange={() => onToggle("is_active", user.is_active)}
          disabled={disabled}
          activeClassName="bg-emerald-500"
          aria-label={`Usuario ${user.username} activo`}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Super admin</span>
        <AdminToggleSwitch
          checked={user.is_admin}
          onChange={() => onToggle("is_admin", user.is_admin)}
          disabled={disabled}
          aria-label={`Usuario ${user.username} super administrador`}
        />
      </div>
    </>
  );
}

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
      <div>
        <h1 className="font-display text-2xl text-white">Gestionar Usuarios</h1>
        <p className="text-sm text-muted mt-1">
          Activa <strong className="text-white/80">Super admin</strong> para dar acceso al panel Plataforma.
        </p>
      </div>

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
          <ul className="md:hidden space-y-3" role="list">
            {users.map((u: AdminUserEntry) => (
              <li
                key={u.id}
                className="rounded-xl border border-white/10 bg-glass p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-medium">{u.username}</p>
                  {u.is_admin && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                      Super admin
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-muted">
                  <span>{u.total_bets} apuestas</span>
                  <span className="text-accent font-bold">{u.total_points} pts</span>
                  <span>{new Date(u.created_at).toLocaleDateString("es-PE")}</span>
                </div>
                <UserAdminControls
                  user={u}
                  onToggle={(field, current) => toggle(u.id, field, current)}
                  disabled={patchUser.isPending}
                />
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-white/10 bg-glass backdrop-blur-sm overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted text-xs uppercase">
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-center px-4 py-3">Activo</th>
                  <th className="text-center px-4 py-3">Super admin</th>
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
                      <AdminToggleSwitch
                        checked={u.is_active}
                        onChange={() => toggle(u.id, "is_active", u.is_active)}
                        disabled={patchUser.isPending}
                        activeClassName="bg-emerald-500"
                        aria-label={`Usuario ${u.username} activo`}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AdminToggleSwitch
                        checked={u.is_admin}
                        onChange={() => toggle(u.id, "is_admin", u.is_admin)}
                        disabled={patchUser.isPending}
                        aria-label={`Usuario ${u.username} super administrador`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-muted">{u.total_bets}</td>
                    <td className="px-4 py-3 text-right text-accent font-bold">{u.total_points}</td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {new Date(u.created_at).toLocaleDateString("es-PE")}
                    </td>
                  </StaggerItem>
                ))}
              </tbody>
            </table>
          </div>

          <UserPagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      </QueryState>
    </div>
  );
}
