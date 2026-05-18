"use client";
import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { BettingSlip } from "@/components/betting/BettingSlip";
import { useMyBets, useMyChangeRequests, type ChangeRequest } from "@/hooks/useBets";
import { useActivePolla } from "@/hooks/useGroups";
import { MyChallengesSection } from "@/components/betting/MyChallengesSection";
import { cn } from "@/lib/utils";

type TabId = "pronosticos" | "retos";

function MyBetsPageFallback() {
  return (
    <PageShell maxWidth="md">
        <p className="text-muted text-center py-20">Cargando...</p>
      </PageShell>
  );
}

function MyBetsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(tabParam === "retos" ? "retos" : "pronosticos");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyBets(page);
  const { data: polla } = useActivePolla();
  const { data: changeReqData } = useMyChangeRequests(1, 100);

  useEffect(() => {
    if (tabParam === "retos" || tabParam === "pronosticos") {
      setTab(tabParam);
    }
  }, [tabParam]);

  function selectTab(next: TabId) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/my-bets?${params.toString()}`, { scroll: false });
  }

  const pendingByBetId = useMemo(() => {
    const map = new Map<string, ChangeRequest>();
    changeReqData?.data?.forEach((cr) => {
      if (cr.status === "pending") map.set(cr.bet_id, cr);
    });
    return map;
  }, [changeReqData]);

  const currency = polla?.currency ?? "USD";

  return (
    <PageShell maxWidth="md">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl text-white">Mis Apuestas</h1>
            <p className="text-sm text-muted mt-1">
              Pronósticos y retos 1v1 con trazabilidad de puntos en el ranking.
            </p>
          </div>
          {polla && (
            <div className="text-right shrink-0">
              {!polla.is_member ? (
                <div className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg px-3 py-2 max-w-48">
                  No eres miembro de la polla aun. Habla con el admin.
                </div>
              ) : (
                <div className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-lg px-3 py-2">
                  Eres miembro de <strong>{polla.name}</strong>
                  {polla.per_match_amount && parseFloat(polla.per_match_amount) > 0 && (
                    <>
                      <br />
                      Extra por partido: {currency} {parseFloat(polla.per_match_amount).toFixed(2)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {polla && polla.per_match_amount && parseFloat(polla.per_match_amount) > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
            <p className="text-amber-300 text-sm font-medium">Sobre los adicionales por partido</p>
            <p className="text-amber-200/70 text-xs mt-1">
              Aparte del pago de entrada a la polla (
              {currency} {polla.entry_fee ? parseFloat(polla.entry_fee).toFixed(2) : "0.00"}), puedes agregar{" "}
              {currency} {parseFloat(polla.per_match_amount).toFixed(2)} adicionales por cada partido al apostar. Cada
              adicional debe ser confirmado por el admin antes de que sume al pozo.
            </p>
          </div>
        )}

        <div className="flex gap-2 mb-6 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            type="button"
            onClick={() => selectTab("pronosticos")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "pronosticos" ? "bg-accent text-background" : "text-muted hover:text-white",
            )}
          >
            Pronósticos
          </button>
          <button
            type="button"
            onClick={() => selectTab("retos")}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "retos" ? "bg-accent text-background" : "text-muted hover:text-white",
            )}
          >
            Retos 1v1
          </button>
        </div>

        {tab === "pronosticos" ? (
          <>
            {isLoading ? (
              <p className="text-muted text-center py-20">Cargando...</p>
            ) : data?.data.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted mb-4">Aun no tienes apuestas</p>
                <Link href="/fixtures" className="text-accent hover:underline">
                  Ver partidos disponibles →
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {data?.data.map((bet) => (
                    <BettingSlip
                      key={bet.id}
                      bet={bet}
                      showChangeRequest
                      pendingRequest={pendingByBetId.get(bet.id) ?? null}
                    />
                  ))}
                </div>
                {data && data.pagination.total_pages > 1 && (
                  <div className="flex justify-center gap-3 mt-8">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                    >
                      ← Anterior
                    </button>
                    <span className="px-4 py-2 text-muted">
                      {page} / {data.pagination.total_pages}
                    </span>
                    <button
                      disabled={page >= data.pagination.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:bg-white/10 disabled:opacity-30"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <MyChallengesSection />
        )}
      </PageShell>
  );
}

export default function MyBetsPage() {
  return (
    <Suspense fallback={<MyBetsPageFallback />}>
      <MyBetsPageContent />
    </Suspense>
  );
}
