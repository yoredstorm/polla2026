/** Detect API errors for actions already completed elsewhere (409 / already-*). */
export function isAlreadyResolvedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const nested = e.error as Record<string, unknown> | undefined;
  const message = String(nested?.message ?? e.message ?? e.detail ?? "").toLowerCase();
  const code = String(nested?.code ?? e.code ?? "").toLowerCase();
  const status = e.status ?? e.statusCode;
  return (
    status === 409 ||
    code.includes("409") ||
    message.includes("already") ||
    message.includes("ya es miembro") ||
    message.includes("ya estaba") ||
    message.includes("already resolved") ||
    message.includes("already confirmed") ||
    message.includes("already a member")
  );
}
