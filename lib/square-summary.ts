import type { SquareSummary, SquareRoom } from "@/lib/types";

interface Money { amount?: number }
export interface SquareOrder {
  ticket_name?: string;
  total_tip_money?: Money;
  total_tax_money?: Money;
  total_discount_money?: Money;
  total_money?: Money;
  line_items?: { catalog_object_id?: string; name?: string; quantity?: string; gross_sales_money?: Money }[];
  tenders?: { type?: string; amount_money?: Money }[];
}

// Ticket prefix decides the room: SP = Spring, S / SU / SM = Summer, AU / A = Autumn.
export const roomOf = (t?: string): "summer" | "spring" | "autumn" | "other" => {
  const m = String(t || "").trim().toUpperCase().match(/^([A-Z]+)/);
  const p = m ? m[1] : "";
  return p === "SP" ? "spring" : p === "S" || p === "SU" || p === "SM" ? "summer" : p === "AU" || p === "A" ? "autumn" : "other";
};

export function summariseOrders(orders: SquareOrder[], cat: Record<string, string>): SquareSummary {
  const mk = () => ({ tables: new Set<string>(), orders: 0, gross: 0, tips: 0 });
  const rooms = { summer: mk(), spring: mk(), autumn: mk(), other: mk() };
  const T = { orders: 0, gross: 0, discount: 0, tax: 0, tips: 0, total: 0, card: 0, cash: 0, otherTender: 0, items: 0, net: 0, avg: 0 };
  const cats: Record<string, { qty: number; gross: number }> = {};
  const itemsQ: Record<string, { qty: number; gross: number }> = {};
  for (const o of orders) {
    T.orders++;
    const r = rooms[roomOf(o.ticket_name)];
    r.orders++;
    if (o.ticket_name) r.tables.add(o.ticket_name);
    const tip = o.total_tip_money?.amount || 0;
    const tax = o.total_tax_money?.amount || 0;
    const disc = o.total_discount_money?.amount || 0;
    const tot = o.total_money?.amount || 0;
    T.tips += tip; T.tax += tax; T.discount += disc; T.total += tot; r.tips += tip;
    for (const li of o.line_items || []) {
      const g = li.gross_sales_money?.amount || 0;
      const q = Number(li.quantity || 0);
      T.gross += g; r.gross += g; T.items += q;
      const c = (li.catalog_object_id && cat[li.catalog_object_id]) || "Other";
      cats[c] = cats[c] || { qty: 0, gross: 0 };
      cats[c].qty += q; cats[c].gross += g;
      const nm = (li.name || "").replace(/_v\d+$/, "");
      itemsQ[nm] = itemsQ[nm] || { qty: 0, gross: 0 };
      itemsQ[nm].qty += q; itemsQ[nm].gross += g;
    }
    for (const t of o.tenders || []) {
      const a = t.amount_money?.amount || 0;
      if (t.type === "CARD") T.card += a;
      else if (t.type === "CASH") T.cash += a;
      else T.otherTender += a;
    }
  }
  T.net = T.total - T.tax - T.tips;
  T.avg = T.orders ? Math.round(T.total / T.orders) : 0;
  const top = Object.entries(itemsQ).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10).map(([name, v]) => ({ name, ...v }));
  const categories = Object.entries(cats).sort((a, b) => b[1].gross - a[1].gross).map(([name, v]) => ({ name, ...v }));
  const R = {} as Record<"summer" | "spring" | "autumn" | "other", SquareRoom>;
  (Object.keys(rooms) as (keyof typeof rooms)[]).forEach((k) => {
    R[k] = { tables: rooms[k].tables.size, orders: rooms[k].orders, gross: rooms[k].gross, tips: rooms[k].tips };
  });
  return { pulledAt: new Date().toISOString(), totals: T, rooms: R, categories, top };
}
