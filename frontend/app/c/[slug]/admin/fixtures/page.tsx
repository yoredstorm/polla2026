"use client";

import { useCallback, useState } from "react";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { FixturesAdminView } from "@/components/features/admin/FixturesAdminView";
import { getApiBase } from "@/lib/api";
import { buildApiUrl } from "@/lib/apiBase";
import { cn } from "@/lib/utils";

type Tab = "manage" | "import";

export default function CompetitionAdminFixturesPage() {
  const slug = useCompetitionSlug();
  const [tab, setTab] = useState<Tab>("manage");
  const toast = useToast((s) => s.add);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    ok: boolean;
    count: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = useCallback(async () => {
    const res = await fetch(
      buildApiUrl(getApiBase(), `/c/${slug}/admin/fixtures/import-template.csv`),
      { credentials: "include" },
    );
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-fixtures-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [slug]);

  async function runImport(dryRun: boolean) {
    if (!file) {
      toast("Selecciona un archivo CSV o JSON", "error");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        buildApiUrl(getApiBase(), `/c/${slug}/admin/fixtures/import?dry_run=${dryRun}`),
        { method: "POST", credentials: "include", body: form },
      );
      const data = await res.json();
      if (!res.ok) {
        toast("Error al importar", "error");
        return;
      }
      setPreview(data);
      if (dryRun) {
        toast(
          data.ok ? `Vista previa: ${data.count} partidos` : "Hay errores en el archivo",
          data.ok ? "success" : "error",
        );
      } else if (data.ok) {
        toast(`Importados ${data.count} partidos`, "success");
      }
    } catch {
      toast("No se pudo importar", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {(
          [
            ["manage", "Gestionar"],
            ["import", "Importar"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-2 text-sm rounded-lg transition-colors",
              tab === id ? "bg-accent/15 text-accent" : "text-muted hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "manage" ? (
        <FixturesAdminView competitionSlug={slug} />
      ) : (
        <div className="space-y-4 rounded-xl border border-white/10 bg-glass p-4 max-w-lg">
          <h2 className="font-display text-xl text-white">Importar partidos</h2>
          <p className="text-sm text-muted">
            Sube un CSV o JSON con columnas: external_id, date, time, team1, team2, round, ground, group.
          </p>
          <Button type="button" variant="secondary" onClick={() => void downloadTemplate()}>
            Descargar plantilla CSV
          </Button>
          <input
            type="file"
            accept=".csv,.json"
            className="block w-full text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-accent/20 file:px-4 file:py-2 file:text-accent"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !file} onClick={() => void runImport(true)}>
              Vista previa (dry-run)
            </Button>
            <Button
              type="button"
              disabled={busy || !file || !preview?.ok}
              onClick={() => void runImport(false)}
            >
              Confirmar importación
            </Button>
          </div>
          {preview && !preview.ok && preview.errors.length > 0 && (
            <ul className="text-sm text-red-400 space-y-1" role="alert">
              {preview.errors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
