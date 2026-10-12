"use client";

import type { CurrentMenu } from "@/lib/menu";

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

// A line mentions a menu item when it starts with the name and the name ends there (so PRUNE does not match PRUNELLE).
const lineHas = (line: string, name: string) => {
  const l = line.trim().toLowerCase();
  const n = name.toLowerCase();
  return l.startsWith(n) && !isWord(l[n.length]);
};

export function MenuChips({
  menu, failed, onRetry, value, onChange, tone, label,
}: {
  menu: CurrentMenu | null; failed: boolean; onRetry: () => void;
  value: string; onChange: (v: string) => void; tone: "warn" | "danger"; label: string;
}) {
  if (failed) {
    return (
      <div className="ho-mfail">
        <span className="ho-caption">Menu list did not load</span>
        <button type="button" className="ho-btn ho-sm" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!menu) return null;

  const lines = value.split("\n");
  const toggle = (name: string) => {
    if (lines.some((l) => lineHas(l, name))) {
      onChange(lines.filter((l) => !lineHas(l, name)).join("\n"));
    } else {
      const base = value.replace(/\s+$/, "");
      onChange(base ? base + "\n" + name : name);
    }
  };
  const group = (names: string[], kind: string) => names.length > 0 && (
    <div className="ho-mgroup" role="group" aria-label={`${label}, ${kind}`}>
      {names.map((n) => {
        const on = lines.some((l) => lineHas(l, n));
        return (
          <button key={n} type="button" aria-pressed={on} className={`ho-mchip ho-m-${tone}${on ? " ho-on" : ""}`} onClick={() => toggle(n)}>
            {on && <span aria-hidden="true">✓</span>}{n}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="ho-mchips">
      {group(menu.cocktails, "cocktails")}
      {group(menu.dishes, "dishes")}
    </div>
  );
}
