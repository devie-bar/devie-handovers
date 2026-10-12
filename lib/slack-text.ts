import type { HandoverRow, MaintenanceItem, SquareSummary } from "@/lib/types";
import { ROOMS } from "@/lib/types";
import { cap, daysSince, eur, fmtDate, weekday } from "@/lib/format";

// The message is written in a small markdown (**bold**, > quote, [text](url))
// and converted to Slack mrkdwn by toMrkdwn at the end.

function squareText(sq: SquareSummary | null): string {
  if (!sq) return "";
  const T = sq.totals;
  const rm = (["summer", "spring", "autumn"] as const)
    .filter((k) => sq.rooms[k]?.orders)
    .map((k) => `${cap(k)} ${eur(sq.rooms[k].gross)} (${sq.rooms[k].tables} tables)`)
    .join(" · ");
  return `\n\n**Square** · net **${eur(T.net)}** · gross ${eur(T.gross)} · tips ${eur(T.tips)} · ${T.orders} orders, avg ${eur(T.avg)} · discounts ${eur(T.discount)} · card ${eur(T.card)}, cash ${eur(T.cash)}\n${rm}\n${sq.categories.map((c) => `${c.name} ${c.qty} (${eur(c.gross)})`).join(" · ")}\nTop: ${sq.top.map((t) => `${t.name} ×${t.qty}`).join(", ")}`;
}

export function slackText(h: HandoverRow, openItems: MaintenanceItem[], link: string) {
  const li = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const rooms = h.rooms || {};
  const low = h.low || [];
  const out = h.out || [];
  const room = (n: string) => {
    const k = n.toLowerCase() as "summer" | "spring" | "autumn";
    const x = rooms[k] || {};
    if (x.open === false) return `**${n}** · closed`;
    const bk = h.booked?.rooms?.[k];
    return `**${n}** · ${x.covers || 0} covers${bk ? ` (${bk.covers} booked)` : ""}${x.by ? ` · reported by ${x.by}` : ""}${x.notes ? "\n" + x.notes : ""}`;
  };
  let m = `**Handover ${fmtDate(h.service_date)}** · ${weekday(h.service_date)} · handover by ${h.author} · **${h.total_covers ?? 0} covers**\n\n${ROOMS.map(room).join("\n\n")}\n\n**VIPs** ${h.vips || "none"}\n\n**85s** ${low.length ? low.join(" · ") : "none"}\n**86s** ${out.length ? out.join(" · ") : "none"}`;
  if (h.notes) m += `\n\n**Notes**\n${h.notes}`;
  if (h.todo) m += `\n\n**To do**\n${li(h.todo).map((x) => "- " + x).join("\n")}`;
  m += h.haiku ? `\n\n${li(h.haiku).map((x) => "> _" + x + "_").join("\n")}` : "\n\n_No haiku tonight._";
  m += squareText(h.square);
  const oldest = openItems.length ? Math.max(...openItems.map((i) => daysSince(i.reported_on))) : 0;
  m += `\n\n:wrench: **${openItems.length} maintenance item${openItems.length === 1 ? "" : "s"} open**${openItems.length ? ` (oldest ${oldest} days)` : ""} · details in thread · [Open in Handovers](${link})`;
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
