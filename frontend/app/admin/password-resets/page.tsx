"use client";

import { AdminPasswordResetTab } from "@/components/features/admin/AdminPasswordResetTab";

export default function AdminPasswordResetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-white">Recuperación de contraseña</h1>
        <p className="text-sm text-muted mt-1">
          Solicitudes de usuarios que olvidaron su clave. Genera una contraseña temporal y entrégala
          de forma segura.
        </p>
      </div>
      <AdminPasswordResetTab />
    </div>
  );
}
