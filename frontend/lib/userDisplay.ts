export function fullName(
  first?: string | null,
  last?: string | null,
): string | null {
  const parts = [first?.trim(), last?.trim()].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" ") : null;
}

export function userLabel(
  first?: string | null,
  last?: string | null,
  username?: string,
): string {
  const name = fullName(first, last);
  const nick = username ? `@${username}` : "";
  if (name && nick) return `${name} (${nick})`;
  if (name) return name;
  return nick || "";
}
