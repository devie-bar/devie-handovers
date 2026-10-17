"use client";

import { useLayoutEffect, useRef } from "react";

const BULLET = "• ";
// The stored value is one item per line with no bullet characters; the editor shows each line behind a bullet.
const show = (stored: string) => stored.split("\n").map((l) => BULLET + l).join("\n");
const strip = (line: string) => line.replace(/^\s*•\s?/, "");

/**
 * A notepad-style list editor: ruled lines, a bullet at the start of every line, Enter starts a new bullet.
 * value and onChange use the plain stored form (lines, no bullets). Empty trailing lines are kept while typing and
 * dropped when the form is saved or published (the callers trim).
 */
export function ListNotepad({ id, value, onChange, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const display = show(value);

  // After a change that rewrote the text, put the caret back where the person was typing.
  useLayoutEffect(() => {
    if (caret.current != null && ref.current) { ref.current.setSelectionRange(caret.current, caret.current); caret.current = null; }
  });

  const commit = (text: string, pos: number) => {
    // Re-bullet any line that lost its bullet (paste, select all and type), counting what that adds before the caret.
    const lines = text.split("\n");
    let at = 0, adjusted = pos;
    for (const l of lines) {
      const start = at;
      at += l.length + 1;
      if (!/^\s*•/.test(l)) {
        if (start <= pos) adjusted += BULLET.length;
      }
    }
    const stored = lines.map(strip).join("\n");
    caret.current = adjusted;
    onChange(stored);
  };

  return (
    <textarea
      ref={ref} id={id} className="ho-notepad" value={display} placeholder={placeholder} spellCheck
      onChange={(e) => commit(e.target.value, e.target.selectionStart)}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        const { selectionStart: a, selectionEnd: b, value: text } = el;
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const next = text.slice(0, a) + "\n" + BULLET + text.slice(b);
          commit(next, a + 1 + BULLET.length);
        } else if (e.key === "Backspace" && a === b) {
          // Backspace right after the bullet of an empty line removes the line instead of sticking.
          const ls = text.lastIndexOf("\n", a - 1) + 1;
          const le = text.indexOf("\n", a) === -1 ? text.length : text.indexOf("\n", a);
          if (ls > 0 && text.slice(ls, a) === BULLET && le === a) {
            e.preventDefault();
            commit(text.slice(0, ls - 1) + text.slice(le), ls - 1);
          }
        }
      }}
    />
  );
}
