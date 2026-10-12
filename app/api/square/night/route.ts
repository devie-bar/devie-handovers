import { NextResponse } from "next/server";
import { fail, isIsoDate, requireUser } from "@/lib/api";
import { serviceWindow } from "@/lib/paris";
import { summariseOrders, type SquareOrder } from "@/lib/square-summary";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://connect.squareup.com/v2";
const VERSION = "2025-01-23";

async function sq<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const errs = (json as { errors?: { detail?: string; code?: string }[] } | null)?.errors;
    const msg = errs?.map((e) => e.detail || e.code).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Square ${path}: ${msg}`);
  }
  return json as T;
}

interface CatObj {
  id: string;
  type: string;
  category_data?: { name?: string };
  item_variation_data?: { item_id?: string };
  item_data?: { reporting_category?: { id?: string }; categories?: { id?: string }[] };
}

// GET /api/square/night?date=YYYY-MM-DD
// Completed orders closed between 15:00 on the date and 06:00 the next day, Paris time.
export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const date = new URL(request.url).searchParams.get("date");
  if (!isIsoDate(date)) return fail(400, "Pass ?date=YYYY-MM-DD.");

  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) return fail(500, "SQUARE_ACCESS_TOKEN is not set on the server.");
  const location = process.env.SQUARE_LOCATION_ID || "LG2QVCZ9QVCNC";

  try {
    const { start, end } = serviceWindow(date);
    let orders: SquareOrder[] = [];
    let cursor: string | undefined;
    do {
      const req: Record<string, unknown> = {
        location_ids: [location],
        query: {
          filter: {
            date_time_filter: { closed_at: { start_at: start.toISOString(), end_at: end.toISOString() } },
            state_filter: { states: ["COMPLETED"] },
          },
          sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
        },
        limit: 100,
      };
      if (cursor) req.cursor = cursor;
      const p = await sq<{ orders?: SquareOrder[]; cursor?: string }>(token, "/orders/search", req);
      orders = orders.concat(p.orders || []);
      cursor = p.cursor;
    } while (cursor);

    const ids = [...new Set(orders.flatMap((o) => (o.line_items || []).map((l) => l.catalog_object_id).filter((x): x is string => !!x)))];
    // Variation id -> reporting category id. Square returns the parent ITEMs as related objects, but not the
    // CATEGORY objects those items point to (one hop only), so the names are resolved in a second lookup.
    const catIdOf: Record<string, string | undefined> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const p = await sq<{ objects?: CatObj[]; related_objects?: CatObj[] }>(token, "/catalog/batch-retrieve", {
        object_ids: ids.slice(i, i + 100),
        include_related_objects: true,
      });
      const itemOf: Record<string, CatObj> = {};
      for (const r of p.related_objects || []) if (r.type === "ITEM") itemOf[r.id] = r;
      for (const o of p.objects || []) {
        const item = o.type === "ITEM" ? o : itemOf[o.item_variation_data?.item_id || ""];
        catIdOf[o.id] = item?.item_data?.reporting_category?.id || item?.item_data?.categories?.[0]?.id;
      }
    }
    const catNames: Record<string, string | undefined> = {};
    const catIds = [...new Set(Object.values(catIdOf).filter((x): x is string => !!x))];
    for (let i = 0; i < catIds.length; i += 100) {
      const p = await sq<{ objects?: CatObj[] }>(token, "/catalog/batch-retrieve", { object_ids: catIds.slice(i, i + 100) });
      for (const o of p.objects || []) if (o.type === "CATEGORY") catNames[o.id] = o.category_data?.name;
    }
    const cat: Record<string, string> = {};
    for (const [id, cid] of Object.entries(catIdOf)) cat[id] = (cid && catNames[cid]) || "Other";

    const summary = summariseOrders(orders, cat);
    return NextResponse.json({ ok: true, date, orderCount: orders.length, summary });
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return fail(504, "Square took longer than a minute to answer. Try again.");
    }
    return fail(502, e.message || "Square did not answer.");
  }
}
