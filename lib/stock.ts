import type { MenuState } from "@/lib/menu";

/** Serves held at or below which a drink is 85 (stop pushing it). The Liquid Library uses the same number. */
export const STOCK_PAR_85 = 20;

/** 86 at zero or below, 85 at or below the par level, otherwise no suggestion. */
export function suggestState(count: number): MenuState {
  if (count <= 0) return "86";
  if (count <= STOCK_PAR_85) return "85";
  return "good";
}

/** Cocktail name (no version suffix) to the serves Square says are left at the bar till. */
export type StockCounts = Record<string, number>;
