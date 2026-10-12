import type { HandoverRow, MaintenanceItem, SquareSummary } from "@/lib/types";
import { ROOMS } from "@/lib/types";
import { daysSince, eur, fmtDate, weekday } from "@/lib/format";

// The message is written in a small markdown (**bold**, > quote, [text](url))
// and converted to Slack mrkdwn by toMrkdwn at the end.

// Multi-line text becomes one bullet per non-empty line; nested bullets are indented four spaces.
const nonEmpty = (s: string | null | undefined) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const top = (s: string) => `• ${s}`;
const sub = (s: string) => `    ◦ ${s}`;

function squareBlock(sq: SquareSummary): string {
  return [
    "**SALES BREAKDOWN**",
    ...sq.categories.map((c) => sub(`${c.name} ${c.qty} (${eur(c.gross)})`)),
    ...(sq.top.length ? [top("Top:"), ...sq.top.slice(0, 5).map((i) => sub(`${i.name} ×${i.qty}`))] : []),
  ].join("\n");
}

export function slackText(h: HandoverRow, openItems: MaintenanceItem[], link: string) {
  const li = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const rooms = h.rooms || {};
  const room = (n: string) => {
    const k = n.toLowerCase() as "summer" | "spring" | "autumn";
    const x = rooms[k] || {};
    const name = n.toUpperCase();
    if (x.open === false) return top(`${name} · closed`);
    const bk = h.booked?.rooms?.[k];
    const sr = h.square?.rooms?.[k];
    const sales = sr ? ` · ${eur(sr.gross)} (${sr.tables} table${sr.tables === 1 ? "" : "s"})` : "";
    const head = top(`${name} · ${x.covers || 0} covers${bk && bk.covers > 0 ? ` (${bk.covers} booked)` : ""}${sales}${x.by ? ` · reported by ${x.by}` : ""}`);
    return [head, ...nonEmpty(x.notes).map(sub)].join("\n");
  };
  const kr = rooms.kitchen;
  const kitchen = kr && (kr.by || nonEmpty(kr.notes).length)
    ? [top(`KITCHEN${kr.by ? ` · reported by ${kr.by}` : ""}`), ...nonEmpty(kr.notes).map(sub)]
    : [];
  const general = nonEmpty(h.notes);
  const sections: string[] = [
    `**Handover ${fmtDate(h.service_date)} (${weekday(h.service_date)})**${h.author ? `\nby ${h.author}` : ""}`,
    // ALL DAY, each room and the kitchen are bullets of one list, a blank line between them.
    [
      [top(`ALL DAY - ${h.total_covers ?? 0} covers${h.square ? ` · ${eur(h.square.totals.gross)}` : ""}`), ...general.map(sub)].join("\n"),
      ...ROOMS.map(room),
      ...(kitchen.length ? [kitchen.join("\n")] : []),
    ].join("\n\n"),
  ];
  const list = (title: string, items: string[]) => { if (items.length) sections.push([`**${title}**`, ...items.map(top)].join("\n")); };
  list("VIPs", nonEmpty(h.vips));
  list("85s", h.low || []);
  list("86s", h.out || []);
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
  let t = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/^&gt; /gm, "> ");
  t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>");
  t = t.replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");
  t = t.replace(/^- /gm, "• ");
  return t;
}
