"use client";

import { menuNames, statusParts, composeStatus, type CurrentMenu, type MenuState } from "@/lib/menu";

/**
 * The 85 and 86 list, laid out like the Liquid Library's menus tab: grouped sections, one row per item with the
 * name on the left and a Good / 85 / 86 toggle on the right. Everything is read from and written back to the two
 * existing strings (shared.low and shared.out), so the publish row, the Slack text and the log are unchanged.
 * (The file keeps its old name from the chip version.)
 */
export function MenuStatusList({
  menu, failed, onRetry, low, out, onChange,
}: {
  menu: CurrentMenu | null; failed: boolean; onRetry: () => void;
  low: string; out: string; onChange: (low: string, out: string) => void;
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

  const names = menuNames(menu);
  const L = statusParts(low, names);
  const O = statusParts(out, names);
  const stateOf = (n: string): MenuState => (O.chosen.includes(n) ? "86" : L.chosen.includes(n) ? "85" : "good");
  const set = (n: string, st: MenuState) => {
    const l = L.chosen.filter((x) => x !== n);
    const o = O.chosen.filter((x) => x !== n);
    if (st === "85") l.push(n);
    if (st === "86") o.push(n);
    onChange(composeStatus(names.filter((x) => l.includes(x)), L.extras), composeStatus(names.filter((x) => o.includes(x)), O.extras));
  };
  const OPTIONS: { v: MenuState; label: string }[] = [{ v: "good", label: "Good" }, { v: "85", label: "85" }, { v: "86", label: "86" }];
  const group = (title: string, items: string[]) => items.length > 0 && (
    <div className="ho-mgroup" role="group" aria-label={title}>
      <div className="ho-mhead ho-label">{title}</div>
      {items.map((n) => {
        const st = stateOf(n);
        return (
          <div key={n} className={`ho-mrow ho-s-${st}`}>
            <span className="ho-mname">{n}</span>
            <div className="ho-mseg" role="group" aria-label={`${n} status`}>
              {OPTIONS.map((o) => (
                <button key={o.v} type="button" aria-pressed={st === o.v} className={st === o.v ? `ho-on ho-o-${o.v}` : ""} onClick={() => set(n, o.v)}>{o.label}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="ho-mlist">
      {group("Cocktails, seasonal", menu.seasonal)}
      {group("Cocktails, evergreen", menu.evergreen)}
      {group("Dishes", menu.dishes)}
    </div>
  );
}
