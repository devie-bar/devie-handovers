"use client";

import { statusParts, composeStatus, type MenuState } from "@/lib/menu";
import { suggestState, type StockCounts } from "@/lib/stock";

export interface StatusGroup { title: string; items: string[] }

/**
 * One room's 85 and 86 list, laid out like the Liquid Library's menus tab: grouped sections, one row per item with
 * the name on the left and a Good / 85 / 86 toggle on the right, then the two off-menu free-text fields. Everything
 * is read from and written back to two strings (the room's low and out), so the log and the Slack text stay simple.
 * onChange gets persist = true for a toggle or a finished edit (save it now) and false while someone is typing.
 * (The file keeps its old name from the chip version.)
 */
export function MenuStatusList({
  idPrefix, groups, failed, onRetry, low, out, onChange, stock, stockFailed, onRetryStock,
}: {
  idPrefix: string;
  groups: StatusGroup[] | null; failed: boolean; onRetry: () => void;
  low: string; out: string; onChange: (low: string, out: string, persist: boolean) => void;
  stock?: StockCounts | null; stockFailed?: string | null; onRetryStock?: () => void;
}) {
  const names = groups ? groups.flatMap((g) => g.items) : [];
  const L = statusParts(low, names);
  const O = statusParts(out, names);
  const stateOf = (n: string): MenuState => (O.chosen.includes(n) ? "86" : L.chosen.includes(n) ? "85" : "good");
  const set = (n: string, st: MenuState) => {
    const l = L.chosen.filter((x) => x !== n);
    const o = O.chosen.filter((x) => x !== n);
    if (st === "85") l.push(n);
    if (st === "86") o.push(n);
    onChange(composeStatus(names.filter((x) => l.includes(x)), L.extras), composeStatus(names.filter((x) => o.includes(x)), O.extras), true);
  };
  // Square's count for a drink, and the state it suggests (85 at the par level or below, 86 at none). The suggestion is
  // only ever shown as a glow on that option of the toggle; nothing is changed until someone presses it.
  const suggested = (n: string): { st: MenuState; count: number } | null => {
    const c = stock ? stock[n] : undefined;
    if (c == null) return null;
    const st = suggestState(c);
    return st === "good" ? null : { st, count: c };
  };
  const OPTIONS: { v: MenuState; label: string }[] = [{ v: "good", label: "Good" }, { v: "85", label: "85" }, { v: "86", label: "86" }];
  const group = (title: string, items: string[]) => items.length > 0 && (
    <div key={title} className="ho-mgroup" role="group" aria-label={title}>
      <div className="ho-mhead ho-label">{title}</div>
      {items.map((n) => {
        const st = stateOf(n);
        return (
          <div key={n} className={`ho-mrow ho-s-${st}`}>
            <span className="ho-mname">
              {n}
              {stock && stock[n] != null && <span className="ho-mstock">{Math.max(0, Math.round(stock[n]))} left</span>}
            </span>
            <div className="ho-mseg" role="group" aria-label={`${n} status`}>
              {OPTIONS.map((o) => {
                const sg = suggested(n);
                const glow = !!sg && sg.st === o.v && st !== o.v;
                return (
                  <button
                    key={o.v} type="button" aria-pressed={st === o.v}
                    className={st === o.v ? `ho-on ho-o-${o.v}` : glow ? "ho-sug" : ""}
                    title={glow ? `Square: ${Math.max(0, Math.round(sg!.count))} left` : undefined}
                    onClick={() => set(n, o.v)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
    {failed && (
      <div className="ho-mfail">
        <span className="ho-caption">Menu list did not load</span>
        <button type="button" className="ho-btn ho-sm" onClick={onRetry}>Retry</button>
      </div>
    )}
    {!failed && stockFailed && names.length > 0 && (
      <div className="ho-mfail">
        <span className="ho-caption">Square stock did not load, so no 85 / 86 suggestions: {stockFailed}</span>
        {onRetryStock && <button type="button" className="ho-btn ho-sm" onClick={onRetryStock}>Retry</button>}
      </div>
    )}
    {groups && <div className="ho-mlist">{groups.map((g) => group(g.title, g.items))}</div>}
    <div className="ho-grid2">
      <div className="ho-f"><label htmlFor={`${idPrefix}-85`}><span className="ho-chip ho-c85">85</span>Running low, off the menu</label>
        <textarea id={`${idPrefix}-85`} value={L.extras}
          onChange={(e) => onChange(composeStatus(L.chosen, e.target.value), out, false)}
          onBlur={() => onChange(low, out, true)} placeholder="One per line, e.g. LEMON, top up batch tomorrow" /></div>
      <div className="ho-f"><label htmlFor={`${idPrefix}-86`}><span className="ho-chip ho-c86">86</span>Out, off the menu</label>
        <textarea id={`${idPrefix}-86`} value={O.extras}
          onChange={(e) => onChange(low, composeStatus(O.chosen, e.target.value), false)}
          onBlur={() => onChange(low, out, true)} placeholder="One per line" /></div>
    </div>
    </>
  );
}
