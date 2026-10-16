import type { SupabaseClient } from "@supabase/supabase-js";

export interface MenuGroups { seasonal: string[]; evergreen: string[] }
/** Spring's list is the Alc cocktails, Summer's the DGS cocktails (one on both appears in both), the Kitchen's the dishes. */
export interface CurrentMenu { alc: MenuGroups; dgs: MenuGroups; dishes: string[] }
export type MenuState = "good" | "85" | "86";

// "CASSIS_v8" becomes "CASSIS".
const clean = (n: unknown) => String(n ?? "").replace(/_v\d+$/, "").trim();
const uniqueSorted = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y));

/**
 * The current menu from the Liquid Library, as the Library's menus tab groups it: published cocktails on the
 * Alc or DGS list (Seasonal, then Evergreen, per the Library's alcSections setting) and published dishes with
 * no category. The Seasonal flag lives in public.settings, which not every signed-in person may read; if it
 * cannot be read, every cocktail is listed as Evergreen, which is also how the Library treats an unflagged one.
 */
export async function getCurrentMenu(supabase: SupabaseClient): Promise<CurrentMenu> {
  const { data, error } = await supabase
    .from("recipes")
    .select("id, type, data")
    .eq("status", "published")
    .in("type", ["cocktail", "dish"]);
  if (error) throw new Error(error.message);
  let sections: Record<string, string> = {};
  try {
    const { data: s } = await supabase.from("settings").select("data").eq("id", "alcSections").maybeSingle();
    if (s && s.data && typeof s.data === "object") sections = s.data as Record<string, string>;
  } catch { /* organisational only; fall back to Evergreen */ }
  const alc: MenuGroups = { seasonal: [], evergreen: [] };
  const dgs: MenuGroups = { seasonal: [], evergreen: [] };
  const dishes: string[] = [];
  for (const r of (data || []) as { id: string; type: string; data: Record<string, unknown> | null }[]) {
    const d = r.data || {};
    const name = clean(d.name);
    if (r.type === "cocktail") {
      const into = (g: MenuGroups) => (sections[r.id] === "seasonal" ? g.seasonal : g.evergreen).push(name);
      if (d.onAlc === true || d.onAlc === "true") into(alc);
      if (d.onDgs === true || d.onDgs === "true") into(dgs);
    }
    if (r.type === "dish" && (d.category == null || d.category === "") && !name.startsWith("DGS Snack")) dishes.push(name);
  }
  const tidy = (g: MenuGroups): MenuGroups => ({ seasonal: uniqueSorted(g.seasonal), evergreen: uniqueSorted(g.evergreen) });
  return { alc: tidy(alc), dgs: tidy(dgs), dishes: uniqueSorted(dishes) };
}

/** Names of one list in order: seasonal, then evergreen. */
export const groupNames = (g: MenuGroups): string[] => [...g.seasonal, ...g.evergreen];

/**
 * rooms.<key>.low / .out (and the legacy shared.low / shared.out) keep one string. Menu picks are one line of names joined with ", " in list order;
 * every other line is free text for off-menu items. A line counts as picks only when every name on it is a
 * menu name, so "LEMON, top up batch tomorrow" stays free text.
 */
export function statusParts(value: string, names: string[]): { chosen: string[]; extras: string } {
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const chosen = new Set<string>();
  const extras: string[] = [];
  for (const line of String(value || "").split("\n")) {
    const toks = line.split(", ").map((x) => x.trim());
    if (line.trim() && toks.every((t) => byLower.has(t.toLowerCase()))) toks.forEach((t) => chosen.add(byLower.get(t.toLowerCase())!));
    else extras.push(line);
  }
  return { chosen: names.filter((n) => chosen.has(n)), extras: extras.join("\n") };
}

export function composeStatus(chosen: string[], extras: string): string {
  const head = chosen.join(", ");
  return head ? (extras ? head + "\n" + extras : head) : extras;
}
