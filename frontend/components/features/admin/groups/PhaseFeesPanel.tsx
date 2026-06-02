"use client";

import { useEffect, useState } from "react";
import { useAdminPhaseFees, usePatchPhaseFees } from "@/hooks/useAdmin";
import type { GroupPhaseFeeRow } from "@/types/api";

export function PhaseFeesPanel({ pollaId, currency }: { pollaId: string; currency: string }) {
  const { data, isLoading } = useAdminPhaseFees(pollaId);
  const patch = usePatchPhaseFees();
  const [rows, setRows] = useState<GroupPhaseFeeRow[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.fees) {
      setRows(data.fees);
      setDirty(false);
    }
  }, [data]);

  function updateRow(index: number, field: "entry_fee" | "extra_per_match", value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
    setDirty(true);
  }

  function save() {
    patch.mutate({
      groupId: pollaId,
      fees: rows.map((r) => ({
        phase_key: r.phase_key,
        entry_fee: parseFloat(r.entry_fee) || 0,
        extra_per_match: r.extra_per_match ? parseFloat(r.extra_per_match) : null,
      })),
    });
    setDirty(false);
  }

  if (isLoading) return <p className="text-sm text-muted">Cargando montos por hito...</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted text-xs uppercase">
              <th className="pb-2 pr-4">Hito</th>
              <th className="pb-2 pr-4">Entrada ({currency})</th>
              <th className="pb-2">Extra / partido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.phase_key} className="border-t border-white/10">
                <td className="py-2 pr-4 text-white font-medium">{row.label}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.entry_fee}
                    onChange={(e) => updateRow(i, "entry_fee", e.target.value)}
                    className="w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-white"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.extra_per_match ?? ""}
                    placeholder="—"
                    onChange={(e) => updateRow(i, "extra_per_match", e.target.value)}
                    className="w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-white"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={!dirty || patch.isPending}
        onClick={save}
        className="text-sm px-4 py-2 rounded-lg bg-accent text-black font-medium disabled:opacity-50"
      >
        {patch.isPending ? "Guardando..." : "Guardar montos por hito"}
      </button>
    </div>
  );
}
