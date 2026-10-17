import type { HandoverRow, MaintenanceItem, SquareSummary } from "@/lib/types";
import { ROOMS } from "@/lib/types";
import { SLACK_IDS } from "@/lib/slack-ids";
import { daysSince, eur, fmtDate, weekday } from "@/lib/format";

// The message is written in a small markdown (**bold**, > quote, [text](url))
// and converted to Slack mrkdwn by toMrkdwn at the end.

// Multi-line text becomes one bullet per non-empty line; nested bullets are indented four spaces.
const nonEmpty = (s: string | null | undefined) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
/** "<@ID>" when the person has a Slack account, otherwise the plain name. */
export const mention = (name: string, ids: Record<string, string> = SLACK_IDS) => (ids[name] ? `<@${ids[name]}>` : name);
const top = (s: string) => `• ${s}`;
const sub = (s: string) => `    ◦ ${s}`;

function squareBlock(sq: SquareSummary): string {
  return [
    "**SALES BREAKDOWN**",
    ...sq.categories.map((c) => sub(`${c.name} ${c.qty} (${eur(c.gross)})`)),
    ...(sq.top.length ? [top("Top:"), ...sq.top.slice(0, 5).map((i) => sub(`${i.name} ×${i.qty}`))] : []),
  ].join("\n");
}

export function slackText(h: HandoverRow, openItems: MaintenanceItem[], link: string, ids: Record<string, string> = SLACK_IDS) {
  const li = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const rooms = h.rooms || {};
  // "◦ 85: PEACH, CASSIS" and "◦ 86: ..." under a room, each left out when empty.
  const stockSubs = (x: { low?: string; out?: string }) => [
    ...(nonEmpty(x.low).length ? [sub(`85: ${nonEmpty(x.low).join(", ")}`)] : []),
    ...(nonEmpty(x.out).length ? [sub(`86: ${nonEmpty(x.out).join(", ")}`)] : []),
  ];
  // "◦ Not done: label, label" for the active checklist items left unticked, omitted when there are none.
  const notDoneSub = (x: { notDone?: string[] }) => (x.notDone && x.notDone.length ? [sub(`Not done: ${x.notDone.join(", ")}`)] : []);
  const room = (n: string) => {
    const k = n.toLowerCase() as "summer" | "spring" | "autumn";
    const x = rooms[k] || {};
    const name = n.toUpperCase();
    if (x.open === false) return top(`${name} · closed`);
    const bk = h.booked?.rooms?.[k];
    const sr = h.square?.rooms?.[k];
    const sales = sr ? ` · ${eur(sr.gross)} (${sr.tables} table${sr.tables === 1 ? "" : "s"})` : "";
    const figure = x.covers == null ? "not reported" : `${x.covers} covers${bk && bk.covers > 0 ? ` (${bk.covers} booked)` : ""}${sales}`;
    const head = top(`${name} · ${figure}${x.by ? ` · reported by ${mention(x.by, ids)}` : ""}`);
    return [head, ...nonEmpty(x.notes).map(sub), ...stockSubs(x), ...notDoneSub(x)].join("\n");
  };
  const unit = (title: string, u?: { by?: string; notes?: string; low?: string; out?: string; notDone?: string[] }, withStock = false) =>
    u && (u.by || nonEmpty(u.notes).length || (withStock && stockSubs(u).length) || notDoneSub(u).length)
      ? [top(`${title}${u.by ? ` · reported by ${mention(u.by, ids)}` : ""}`), ...nonEmpty(u.notes).map(sub), ...(withStock ? stockSubs(u) : []), ...notDoneSub(u)]
      : [];
  const kitchen = unit("KITCHEN", rooms.kitchen, true);
  const prep = unit("PREP / MEP", rooms.prep);
  const general = nonEmpty(h.notes);
  const sections: string[] = [
    `**Handover ${fmtDate(h.service_date)} (${weekday(h.service_date)})**${h.author ? `\nby ${mention(h.author, ids)}` : ""}`,
    // Prep / MEP, ALL DAY, each room and the kitchen are bullets of one list, a blank line between them.
    [
      ...(prep.length ? [prep.join("\n")] : []),
      [top(`ALL DAY - ${h.total_covers ?? 0} covers${h.square ? ` · ${eur(h.square.totals.gross)}` : ""}`), ...general.map(sub)].join("\n"),
      ...ROOMS.map(room),
      ...(kitchen.length ? [kitchen.join("\n")] : []),
    ].join("\n\n"),
  ];
  const list = (title: string, items: string[]) => { if (items.length) sections.push([`**${title}**`, ...items.map(top)].join("\n")); };
  list("VIPs", nonEmpty(h.vips));
  // Nights published before 85 / 86 moved into the rooms keep one list for the whole night.
  if (![rooms.summer, rooms.spring, rooms.autumn, rooms.kitchen].some((x) => x && (x.low || x.out))) {
    list("85s", h.low || []);
    list("86s", h.out || []);
  }
  list("TO DO", nonEmpty(h.todo));
  const haiku = nonEmpty(h.haiku);
  sections.push(haiku.length ? ["**HAIKU**", ...haiku].join("\n") : "No haiku tonight.");
  if (h.square) sections.push(squareBlock(h.square));
  const m = sections.join("\n\n");
  const sorted = [...openItems].sort((a, b) => a.reported_on.localeCompare(b.reported_on));
  const thread = openItems.length
    ? `:wrench: **Maintenance carried over** · ${openItems.length} open\n\n` +
      sorted.map((i) => {
        const age = daysSince(i.reported_on);
        const u = (i.updates || []).slice(-2).map((x) => `\n   ↳ ${fmtDate(x.on).slice(0, 5)} ${x.by}: ${x.text}`).join("");
        return `${i.status === "progress" ? ":large_yellow_circle:" : ":red_circle:"} **${i.title}** · ${i.location || ""} · ${i.reported_by || ""}, ${fmtDate(i.reported_on)} · **${age} day${age === 1 ? "" : "s"}**${i.status === "progress" ? " · in hand" : ""}${u}`;
      }).join("\n") +
      `\n\nTick things off in [Handovers](${link}) and they drop off this list tomorrow night.`
    : "";
  return { m: toMrkdwn(m), thread: toMrkdwn(thread) };
}

/** **bold** to *bold*, [text](url) to <url|text>, quotes kept, "- " bullets to "• ", & < > escaped. */
export function toMrkdwn(s: string): string {
  if (!s) return s;
  // User mentions (<@U123>) must survive the escaping below.
  const mentions: string[] = [];
  let t = s.replace(/<@[UW][A-Z0-9]+>/g, (m) => `\u0000${mentions.push(m) - 1}\u0000`);
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/^&gt; /gm, "> ");
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>");
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");
  t = t.replace(/^- /gm, "• ");
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => mentions[Number(i)]);
}
