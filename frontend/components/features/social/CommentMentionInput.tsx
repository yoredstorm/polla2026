"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMentionSuggestions, type MentionSuggestion } from "@/hooks/useSocial";
import { cn } from "@/lib/utils";

export interface MentionContext {
  query: string;
  start: number;
}

/** Text before cursor ends with @partial-username */
export function getMentionContext(text: string, cursor: number): MentionContext | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  return { query: match[1], start: cursor - match[0].length };
}

function insertMention(text: string, ctx: MentionContext, cursor: number, username: string): string {
  const before = text.slice(0, ctx.start);
  const after = text.slice(cursor);
  return `${before}@${username} ${after}`;
}

interface CommentMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CommentMentionInput({
  value,
  onChange,
  maxLength = 500,
  placeholder,
  disabled,
  className,
}: CommentMentionInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [cursor, setCursor] = useState(0);
  const [mentionCtx, setMentionCtx] = useState<MentionContext | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(mentionCtx?.query ?? ""), 180);
    return () => window.clearTimeout(t);
  }, [mentionCtx?.query]);

  const { data: suggestions = [] } = useMentionSuggestions(debouncedQuery, open && mentionCtx !== null);

  const syncMentionState = useCallback((text: string, pos: number) => {
    setCursor(pos);
    const ctx = getMentionContext(text, pos);
    setMentionCtx(ctx);
    setOpen(ctx !== null);
    setActiveIndex(0);
  }, []);

  function pickSuggestion(user: MentionSuggestion) {
    if (!mentionCtx || !inputRef.current) return;
    const next = insertMention(value, mentionCtx, cursor, user.username);
    onChange(next.slice(0, maxLength));
    setOpen(false);
    setMentionCtx(null);
    const newCursor = mentionCtx.start + user.username.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
      syncMentionState(next.slice(0, maxLength), newCursor);
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    syncMentionState(v, e.target.selectionStart ?? v.length);
  }

  function handleSelect(e: React.SyntheticEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    syncMentionState(el.value, el.selectionStart ?? el.value.length);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && mentionCtx) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        listRef.current?.contains(t) ||
        inputRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white",
          className,
        )}
      />
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-white/10 bg-surface shadow-xl max-h-44 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-150"
          role="listbox"
        >
          {suggestions.map((u, idx) => (
            <li key={u.username} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                  idx === activeIndex ? "bg-accent/15 text-accent" : "hover:bg-white/10 text-white",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(u);
                }}
              >
                <UserAvatar username={u.username} avatarDisplay={u.avatar_display} size="xs" />
                <span className="font-medium">@{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && mentionCtx && suggestions.length === 0 && debouncedQuery.length >= 1 && (
        <p className="absolute z-20 left-0 right-0 mt-1 px-3 py-2 text-xs text-muted rounded-lg border border-white/10 bg-surface">
          Ningun miembro coincide con @{debouncedQuery}
        </p>
      )}
    </div>
  );
}
