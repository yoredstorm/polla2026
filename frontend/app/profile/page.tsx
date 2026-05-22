"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageShell } from "@/components/ui/PageShell";
import { HelpSectionTitle } from "@/components/help/HelpSectionTitle";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { Button } from "@/components/ui/Button";
import { useUpdateBetsProfile, useUpdateProfileName } from "@/hooks/useUserProfile";
import { UserDisplayName } from "@/components/ui/UserDisplayName";
import { fullName } from "@/lib/userDisplay";
import { getMe } from "@/lib/auth";
import { BadgeGrid } from "@/components/gamification/BadgeGrid";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";
import { ProfileSecuritySection } from "@/components/profile/ProfileSecuritySection";
import { useMyBadgeProgress } from "@/hooks/useBadgeCatalog";
import { cn } from "@/lib/utils";
import type { BadgeOut } from "@/types/api";

function BadgesSection() {
  const { data } = useQuery({
    queryKey: ["me", "badges"],
    queryFn: () => api.get<{ badges: BadgeOut[] }>("/users/me/badges"),
  });
  const { data: progress } = useMyBadgeProgress();
  const badges = data?.badges ?? [];
  const earned = progress?.earned_count ?? badges.length;
  const total = progress?.total_count ?? 0;
  const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-white/10 bg-glass p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg text-white">Tus medallas</h3>
          <HelpTooltip helpKey="page.profile.badges" label="Medallas" />
        </div>
        <Link href="/dashboard#medallas" className="text-xs text-accent hover:underline shrink-0">
          Ver todas →
        </Link>
      </div>
      {total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>Progreso de coleccion</span>
            <span>
              {earned}/{total} ({pct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <BadgeGrid badges={badges} emptyLabel="Aún no tienes medallas. Apuesta, acierta y gana duelos." />
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
  });
  const updateProfile = useUpdateBetsProfile();
  const updateName = useUpdateProfileName();
  const [flash, setFlash] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  useEffect(() => {
    if (me) {
      setFirstName(me.first_name ?? "");
      setLastName(me.last_name ?? "");
    }
  }, [me?.id, me?.first_name, me?.last_name]);

  const isPrivate = (me?.bets_profile_visibility ?? "public") === "invite_only";
  const showAmounts = me?.show_bet_amounts !== false;

  useEffect(() => {
    if (!isLoading && !me) router.replace("/login");
  }, [isLoading, me, router]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFlash("Copiado al portapapeles.");
      setTimeout(() => setFlash(null), 2000);
    } catch {
      setFlash("No se pudo copiar; copia el código manualmente.");
    }
  }

  async function setVisibility(nextPrivate: boolean) {
    if (!me || updateProfile.isPending) return;
    if (nextPrivate === isPrivate) return;
    setLastCode(null);
    setFlash(null);
    try {
      if (nextPrivate) {
        const r = await updateProfile.mutateAsync({ visibility: "invite_only", rotate_code: false });
        if (r.new_invite_code) {
          setLastCode(r.new_invite_code);
          setFlash("Código generado. Guárdalo: solo se muestra ahora.");
        } else {
          setFlash("Perfil privado activo (código ya existía).");
        }
      } else {
        await updateProfile.mutateAsync({ visibility: "public", rotate_code: false });
        setFlash("Tu listado de apuestas es público para usuarios autenticados.");
      }
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      setFlash(msg || "No se pudo guardar. Intenta de nuevo.");
    }
  }

  async function onNewCode() {
    if (!me || updateProfile.isPending) return;
    setLastCode(null);
    setFlash(null);
    try {
      const r = await updateProfile.mutateAsync({ visibility: "invite_only", rotate_code: true });
      if (r.new_invite_code) {
        setLastCode(r.new_invite_code);
        setFlash("Nuevo código (el anterior deja de valer). Solo se muestra ahora.");
      } else {
        setFlash("Código actualizado.");
      }
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "error" in e
          ? String((e as { error?: { message?: string } }).error?.message ?? "")
          : "";
      setFlash(msg || "No se pudo generar el código.");
    }
  }

  if (isLoading || !me) {
    return (
      <PageShell maxWidth="sm">
        <p className="text-center text-muted py-20">Cargando...</p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="sm">
        <HelpSectionTitle as="h1" helpKey="page.profile" className="mb-2">
          Mi perfil
        </HelpSectionTitle>
        <div className="mb-8">
          <UserDisplayName username={me.username} firstName={me.first_name} lastName={me.last_name} />
        </div>

        {!fullName(me.first_name, me.last_name) && (
          <p className="mb-6 text-sm text-amber-200/90 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            Completa tu nombre y apellido para que otros participantes te reconozcan en apuestas y ranking.
          </p>
        )}

        <div className="mb-6">
          <AvatarPicker user={me} />
        </div>

        <section className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6 space-y-4 mb-6">
          <h2 className="font-display text-lg text-white">Tu nombre</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Nombre</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Apellido</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={updateName.isPending}
            onClick={async () => {
              setFlash(null);
              try {
                await updateName.mutateAsync({
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                });
                setFlash("Nombre actualizado.");
              } catch {
                setFlash("No se pudo guardar el nombre.");
              }
            }}
          >
            Guardar nombre
          </Button>
        </section>

        <section className="rounded-2xl border border-white/10 bg-glass backdrop-blur-sm p-6 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">Quién ve tus apuestas</h2>
              <HelpTooltip helpKey="page.profile.privacy" label="Privacidad de apuestas" />
            </div>
            <p className="text-xs text-muted mb-4">
              Afecta solo el detalle en{" "}
              <Link href={`/u/${encodeURIComponent(me.username)}`} className="text-accent hover:underline">
                tu página pública
              </Link>
              . No es el código de la polla.
            </p>

            <div
              className="flex rounded-xl bg-black/30 p-1 border border-white/10"
              role="radiogroup"
              aria-label="Visibilidad del listado de apuestas"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!isPrivate}
                disabled={updateProfile.isPending}
                onClick={() => void setVisibility(false)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                  !isPrivate ? "bg-accent text-background shadow" : "text-muted hover:text-white",
                )}
              >
                Público
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isPrivate}
                disabled={updateProfile.isPending}
                onClick={() => void setVisibility(true)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                  isPrivate ? "bg-accent text-background shadow" : "text-muted hover:text-white",
                )}
              >
                Privado (código)
              </button>
            </div>
            <p className="text-xs text-muted mt-3">
              {isPrivate
                ? "Solo tú o quien tenga el código vigente puede ver marcadores y montos."
                : "Cualquier usuario con sesión puede ver tu listado de apuestas."}
            </p>
          </div>

          {isPrivate && (
            <div className="pt-2 border-t border-white/10 space-y-3">
              <p className="text-xs text-muted">
                Código para ver apuestas:{" "}
                {me.has_bets_profile_invite_code
                  ? "activo (el valor no se guarda en texto en el servidor)."
                  : "se generará al elegir Privado o con el botón de abajo."}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                loading={updateProfile.isPending}
                onClick={() => void onNewCode()}
              >
                Generar nuevo código
              </Button>
              <p className="text-xs text-amber-200/90">
                Al generar uno nuevo, el código anterior deja de funcionar para quien lo tuviera.
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg text-white">Visibilidad de montos</h2>
              <HelpTooltip helpKey="page.profile.amounts" label="Visibilidad de montos" />
            </div>
            <p className="text-xs text-muted mb-4">
              Controla si los demas ven cuanto dinero llevas apostando en tu perfil publico.
            </p>
            <div
              className="flex rounded-xl bg-black/30 p-1 border border-white/10"
              role="radiogroup"
              aria-label="Visibilidad de montos apostados"
            >
              <button
                type="button"
                role="radio"
                aria-checked={showAmounts}
                disabled={updateProfile.isPending}
                onClick={async () => {
                  if (showAmounts || updateProfile.isPending) return;
                  setFlash(null);
                  try {
                    await updateProfile.mutateAsync({
                      visibility: me!.bets_profile_visibility as "public" | "invite_only",
                      show_bet_amounts: true,
                    });
                    setFlash("Tus montos son visibles en tu perfil publico.");
                  } catch { setFlash("No se pudo guardar."); }
                }}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                  showAmounts ? "bg-accent text-background shadow" : "text-muted hover:text-white",
                )}
              >
                Mostrar montos
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!showAmounts}
                disabled={updateProfile.isPending}
                onClick={async () => {
                  if (!showAmounts || updateProfile.isPending) return;
                  setFlash(null);
                  try {
                    await updateProfile.mutateAsync({
                      visibility: me!.bets_profile_visibility as "public" | "invite_only",
                      show_bet_amounts: false,
                    });
                    setFlash("Tus montos apareceran ocultos en tu perfil publico.");
                  } catch { setFlash("No se pudo guardar."); }
                }}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors",
                  !showAmounts ? "bg-accent text-background shadow" : "text-muted hover:text-white",
                )}
              >
                Ocultar montos
              </button>
            </div>
            <p className="text-xs text-muted mt-3">
              {showAmounts
                ? "Los demas pueden ver cuanto llevas apostado en cada partido."
                : "Tus montos se mostraran borrosos en tu perfil publico."}
            </p>
          </div>

          <ProfileSecuritySection />

          <ChangePasswordSection />

          <BadgesSection />

          {flash && <p className="text-sm text-accent">{flash}</p>}

          {lastCode && (
            <div className="rounded-xl bg-black/40 border border-accent/30 p-4 space-y-2">
              <p className="text-xs text-muted uppercase tracking-wide">Código (cópialo ya)</p>
              <p className="font-mono text-sm text-white break-all select-all">{lastCode}</p>
              <button type="button" onClick={() => copyText(lastCode)} className="text-sm text-accent hover:underline">
                Copiar
              </button>
            </div>
          )}
        </section>

        <p className="text-center mt-8">
          <Link href="/dashboard" className="text-sm text-muted hover:text-white">
            ← Volver al panel
          </Link>
        </p>
      </PageShell>
  );
}
