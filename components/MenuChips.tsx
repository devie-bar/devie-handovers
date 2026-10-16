"use client";

import { statusParts, composeStatus, type MenuState } from "@/lib/menu";
import { STOCK_PAR_85, suggestState, type StockCounts } from "@/lib/stock";

const RANK: Record<MenuState, number> = { good: 0, "85": 1, "86": 2 };

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
  // Square-based suggestions. A suggestion only ever raises a drink (Good to 85, 85 to 86); it never lowers one the
  // team has already set, and nothing is applied until someone presses a button.
  const suggestion = (n: string): { st: MenuState; count: number } | null => {
    const c = stock ? stock[n] : undefined;
    if (c == null) return null;
    const st = suggestState(c);
    return RANK[st] > RANK[stateOf(n)] ? { st, count: c } : null;
  };
  const pending = names.map((n) => ({ n, sg: suggestion(n) })).filter((x): x is { n: string; sg: { st: MenuState; count: number } } => !!x.sg);
  const applyAll = () => {
    const l = new Set(L.chosen), o = new Set(O.chosen);
    for (const { n, sg } of pending) {
      l.delete(n); o.delete(n);
      if (sg.st === "85") l.add(n);
      if (sg.st === "86") o.add(n);
    }
    onChange(composeStatus(names.filter((x) => l.has(x)), L.extras), composeStatus(names.filter((x) => o.has(x)), O.extras), true);
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
            {suggestion(n) && (
              <button type="button" className={`ho-msug ho-sg-${suggestion(n)!.st}`} onClick={() => set(n, suggestion(n)!.st)}
                title={`Square has ${Math.max(0, Math.round(suggestion(n)!.count))} left`}>
                Suggest {suggestion(n)!.st}
              </button>
            )}
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

  const hasStock = !!stock && names.some((n) => stock[n] != null);
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
    {!failed && !stockFailed && hasStock && (
      <div className="ho-mfail">
        <span className="ho-caption">
          {pending.length > 0
            ? `Square suggests ${pending.length} change${pending.length === 1 ? "" : "s"}: 85 at ${STOCK_PAR_85} or fewer left, 86 at none.`
            : `Square counts agree with the list below (85 at ${STOCK_PAR_85} or fewer left, 86 at none).`}
        </span>
        {pending.length > 0 && <button type="button" className="ho-btn ho-sm" onClick={applyAll}>Apply suggestions</button>}
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
