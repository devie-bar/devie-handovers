import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BASE = "https://connect.squareup.com/v2";
const VERSION = "2025-01-23";

const clean = (n: unknown) => String(n ?? "").replace(/_v\d+$/, "").trim();

// GET /api/square/stock
// Serves left per cocktail on the current menu, read from Square's inventory counts at the bar till. Read only.
// Square is the till's source of truth (sales take counts down in real time), so these are what the floor sees.
// A drink with no Square count record is left out rather than guessed.
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) return fail(500, "SQUARE_ACCESS_TOKEN is not set on the server.");
  const location = process.env.SQUARE_LOCATION_ID || "LG2QVCZ9QVCNC";

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase.from("recipes").select("id, data").eq("status", "published").eq("type", "cocktail");
    if (error) return fail(502, "Could not read the menu: " + error.message);

    const varOfName = new Map<string, Set<string>>();
    for (const r of (data || []) as { id: string; data: Record<string, unknown> | null }[]) {
      const d = r.data || {};
      const onMenu = d.onAlc === true || d.onAlc === "true" || d.onDgs === true || d.onDgs === "true";
      const v = typeof d.squareVariationId === "string" ? d.squareVariationId : "";
      if (!onMenu || !v) continue;
      const name = clean(d.name);
      if (!varOfName.has(name)) varOfName.set(name, new Set());
      varOfName.get(name)!.add(v);
    }
    const ids = [...new Set([...varOfName.values()].flatMap((s) => [...s]))];
    if (ids.length === 0) return NextResponse.json({ ok: true, counts: {}, fetchedAt: new Date().toISOString() });

    const qtyOf = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      let cursor: string | undefined;
      do {
        const res = await fetch(BASE + "/inventory/counts/batch-retrieve", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Square-Version": VERSION, "Content-Type": "application/json" },
          body: JSON.stringify({ catalog_object_ids: ids.slice(i, i + 100), location_ids: [location], states: ["IN_STOCK"], ...(cursor ? { cursor } : {}) }),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        const json = (await res.json().catch(() => null)) as { counts?: { catalog_object_id: string; quantity: string }[]; cursor?: string; errors?: { detail?: string; code?: string }[] } | null;
        if (!res.ok) {
          const msg = json?.errors?.map((e) => e.detail || e.code).join("; ") || `HTTP ${res.status}`;
          return fail(502, "Square inventory: " + msg);
        }
        for (const c of json?.counts || []) qtyOf.set(c.catalog_object_id, parseFloat(c.quantity) || 0);
        cursor = json?.cursor;
      } while (cursor);
    }

    // Two published versions of one name, or one variation shared by an alcoholic drink and its NA twin, would
    // each report a count; take the lowest so a drink is never suggested as fine when one of them is short.
    const counts: Record<string, number> = {};
    for (const [name, vars] of varOfName) {
      const known = [...vars].filter((v) => qtyOf.has(v)).map((v) => qtyOf.get(v)!);
      if (known.length) counts[name] = Math.min(...known);
    }
    return NextResponse.json({ ok: true, counts, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") return fail(504, "Square took too long to answer. Try again.");
    return fail(502, e.message || "Square did not answer.");
  }
}
