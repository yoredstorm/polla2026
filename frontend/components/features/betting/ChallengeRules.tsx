"use client";
import { CHALLENGE_RULES } from "@/lib/challengeUtils";

export function ChallengeRules({ compact = false }: { compact?: boolean }) {
  const textClass = compact ? "text-xs text-muted space-y-2" : "text-sm text-muted space-y-3";
  return (
    <div className={textClass}>
      <div>
        <p className="text-white/80 font-medium mb-1">{CHALLENGE_RULES.betTitle}</p>
        <ul className="list-disc list-inside space-y-0.5">
          {CHALLENGE_RULES.betLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-white/80 font-medium mb-1">{CHALLENGE_RULES.duelTitle}</p>
        <ul className="list-disc list-inside space-y-0.5">
          {CHALLENGE_RULES.duelLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
