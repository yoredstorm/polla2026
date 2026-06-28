"use client";

import { useCallback, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { useCompetitionSlug } from "@/components/providers/CompetitionProvider";
import { useCompetitionContext } from "@/hooks/useCompetitions";
import { useToast } from "@/components/ui/Toast";
import { getApiBase } from "@/lib/api";
import { buildApiUrl } from "@/lib/apiBase";

export default function CompetitionFixturesImportPage() {
  const slug = useCompetitionSlug();
  const { data: ctx } = useCompetitionContext();
  const toast = useToast((s) => s.add);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ ok: boolean; count: number; errors: { row: number; message: string }[] } | null>(null);
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
        toast(data.ok ? `Vista previa: ${data.count} partidos` : "Hay errores en el archivo", data.ok ? "success" : "error");
      } else if (data.ok) {
        toast(`Importados ${data.count} partidos`, "success");
      }
    } catch {
      toast("No se pudo importar", "error");
    } finally {
      setBusy(false);
    }
  }

  if (ctx && !ctx.is_admin) {
    return (
      <PageShell maxWidth="md">
        <p className="text-muted text-center py-16">No tienes permisos de administrador en esta competencia.</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="md">
      <h1 className="font-display text-2xl text-white mb-2">Importar partidos</h1>
      <p className="text-sm text-muted mb-6">
        Sube un CSV o JSON con columnas: external_id, date, time, team1, team2, round, ground, group.
      </p>

      <div className="space-y-4 rounded-xl border border-white/10 bg-glass p-4">
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
          <Button type="button" disabled={busy || !file || !preview?.ok} onClick={() => void runImport(false)}>
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
    </PageShell>
  );
}
