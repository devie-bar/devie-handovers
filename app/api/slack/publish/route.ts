import { NextResponse } from "next/server";
import { fail, isIsoDate, requireUser } from "@/lib/api";
import { createPublicClient } from "@/lib/supabase/server";
import { slackText } from "@/lib/slack-text";
import { slackIds } from "@/lib/slack-users";
import type { HandoverRow, MaintenanceItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LINK = "https://handovers.devie.bar";

async function post(token: string, body: Record<string, unknown>) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ unfurl_links: false, unfurl_media: false, mrkdwn: true, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const j = (await res.json()) as { ok: boolean; error?: string; ts?: string; channel?: string };
  if (!j.ok) throw new Error(j.error || `Slack HTTP ${res.status}`);
  return j;
}

// POST { date, target: "channel" | "test" }
// Reads the handovers row for the date and the open maintenance items, posts the
// message, then the maintenance thread reply, and stores ts and channel on the draft.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let payload: { date?: string; target?: string } = {};
  try { payload = await request.json(); } catch { return fail(400, "Send JSON: {date, target}."); }
  const { date, target } = payload;
  if (!isIsoDate(date)) return fail(400, "date must be YYYY-MM-DD.");
  if (target !== "channel" && target !== "test") return fail(400, 'target must be "channel" or "test".');

  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return fail(500, "SLACK_BOT_TOKEN is not set on the server.");
  const channel = target === "channel"
    ? process.env.HANDOVERS_SLACK_CHANNEL || "C07FN2USAJC"
    : process.env.SLACK_TEST_CHANNEL || "U072GTX5E3B";

  const supabase = createPublicClient();
  const { data: h, error: he } = await supabase.from("handovers").select("*").eq("service_date", date).maybeSingle();
  if (he) return fail(500, "Could not read the handover: " + he.message);
  if (!h) return fail(404, "No handover has been saved for that date yet.");
  const { data: items, error: me } = await supabase.from("maintenance_items").select("*").neq("status", "done");
  if (me) return fail(500, "Could not read the maintenance list: " + me.message);

  try {
    const ids = await slackIds(token); // never throws; falls back to lib/slack-ids.ts
    const { m, thread } = slackText(h as HandoverRow, (items || []) as MaintenanceItem[], LINK, ids);
    const first = await post(token, { channel, text: m });
    const chan = first.channel || channel;
    if (thread && first.ts) await post(token, { channel: chan, text: thread, thread_ts: first.ts });
    const { error: ue } = await supabase
      .from("handover_drafts")
      .update({ slack_ts: first.ts ?? null, slack_channel: chan })
      .eq("service_date", date);
    return NextResponse.json({ ok: true, target, ts: first.ts ?? null, channel: chan, storeError: ue?.message ?? null });
  } catch (err) {
    const e = err as Error;
    const msg = e.name === "TimeoutError" ? "Slack took too long to answer." : e.message;
    return fail(502, msg);
  }
}
