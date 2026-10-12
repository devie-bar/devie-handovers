import type { SupabaseClient } from "@supabase/supabase-js";

export interface CurrentMenu { cocktails: string[]; dishes: string[] }

// "CASSIS_v8" becomes "CASSIS".
const clean = (n: unknown) => String(n ?? "").replace(/_v\d+$/, "").trim();
const uniqueSorted = (a: string[]) => Array.from(new Set(a.filter(Boolean))).sort((x, y) => x.localeCompare(y));

/** The current menu from the Liquid Library: published cocktails on the Alc or DGS list, and published dishes with no category. */
export async function getCurrentMenu(supabase: SupabaseClient): Promise<CurrentMenu> {
  const { data, error } = await supabase
    .from("recipes")
    .select("type, data")
    .eq("status", "published")
    .in("type", ["cocktail", "dish"]);
  if (error) throw new Error(error.message);
  const cocktails: string[] = [];
  const dishes: string[] = [];
  for (const r of (data || []) as { type: string; data: Record<string, unknown> | null }[]) {
    const d = r.data || {};
    const name = clean(d.name);
    if (r.type === "cocktail" && (d.onAlc === true || d.onAlc === "true" || d.onDgs === true || d.onDgs === "true")) cocktails.push(name);
    if (r.type === "dish" && (d.category == null || d.category === "") && !name.startsWith("DGS Snack")) dishes.push(name);
  }
  return { cocktails: uniqueSorted(cocktails), dishes: uniqueSorted(dishes) };
}
