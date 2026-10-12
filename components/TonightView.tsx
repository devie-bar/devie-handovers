"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import { MenuStatusList } from "@/components/MenuChips";
import { menuNames, statusParts, composeStatus } from "@/lib/menu";
import { MaintenancePanel } from "@/components/MaintenancePanel";
import { cap, eur, lines } from "@/lib/format";
import { serviceDateNow, timeHM } from "@/lib/paris";
import {
  CHANNEL_LABEL, LOCATIONS, ROOMS, ROOM_KEYS,
  type DraftRow, type HandoverRoom, type HandoverRow, type RoomKey, type RoomPart, type Shared, type SquareSummary,
} from "@/lib/types";

const BLANK_SHARED: Required<Shared> = { vips: "", low: "", out: "", notes: "", todo: "", haiku: "" };

const blankDraft = (d: string): DraftRow => ({
  service_date: d,
  status: "draft",
  rooms: {
    summer: { by: "", covers: 0, notes: "", closed: false, submittedAt: null },
    spring: { by: "", covers: 0, notes: "", closed: false, submittedAt: null },
    autumn: { by: "", covers: 0, notes: "", closed: true, submittedAt: null },
  },
  shared: { ...BLANK_SHARED },
  booked: null,
  square: null,
  published_by: null,
  published_at: null,
  slack_ts: null,
  slack_channel: null,
});

// Fill in anything the stored row leaves out, so the form can always read every key.
function normalise(row: DraftRow): DraftRow {
  const b = blankDraft(row.service_date);
  return {
    ...b, ...row,
    rooms: { summer: { ...b.rooms.summer, ...row.rooms?.summer }, spring: { ...b.rooms.spring, ...row.rooms?.spring }, autumn: { ...b.rooms.autumn, ...row.rooms?.autumn } },
    shared: { ...BLANK_SHARED, ...row.shared },
  };
}

// A night that was already published before it had a draft: rebuild the draft from the log row.
function seedFromHandover(prev: HandoverRow): DraftRow {
  const d = blankDraft(prev.service_date);
  const rooms = {} as Record<RoomKey, RoomPart>;
  ROOM_KEYS.forEach((k) => {
    const x: HandoverRoom = prev.rooms?.[k] || {};
    rooms[k] = { by: prev.author || "", covers: x.covers || 0, notes: x.notes || "", closed: x.open === false, submittedAt: prev.posted_at };
  });
  return {
    ...d, status: "published", published_by: prev.author, published_at: prev.posted_at, rooms,
    shared: {
      vips: prev.vips || "", low: (prev.low || []).join("\n"), out: (prev.out || []).join("\n"),
      notes: prev.notes || "", todo: prev.todo || "", haiku: prev.haiku || "",
    },
    square: prev.square, booked: prev.booked,
  };
}

// "Saturday 11 October" for a yyyy-mm-dd service date.
function dateTitle(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(Date.UTC(y, m - 1, day)));
}

type Edit = { by?: string; covers?: string; notes?: string };

export function TonightView() {
  const { supabase, people, author, setAuthor, items, addItem, menu, menuFailed, retryMenu } = useHandovers();
  const [date, setDate] = useState(serviceDateNow());
  const [draft, setDraft] = useState<DraftRow>(() => blankDraft(serviceDateNow()));
  const [edits, setEdits] = useState<Partial<Record<RoomKey, Edit>>>({});
  const [shared, setShared] = useState<Required<Shared>>({ ...BLANK_SHARED });
  const [dirtyShared, setDirtyShared] = useState(false);
  const [toastText, setToastText] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sqBusy, setSqBusy] = useState(false);
  const [sqErr, setSqErr] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Publishing always goes to #handovers; ?test=1 on the URL sends it to the author alone instead.
  const [testMode, setTestMode] = useState(false);
  useEffect(() => { setTestMode(new URLSearchParams(window.location.search).get("test") === "1"); }, []);
  const target: "channel" | "test" = testMode ? "test" : "channel";
  const [flagTitle, setFlagTitle] = useState("");
  const [flagLoc, setFlagLoc] = useState("Bar");
  const [pickDate, setPickDate] = useState(false);
  const [openOverride, setOpenOverride] = useState<Partial<Record<RoomKey, boolean>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((m: string) => {
    setToastText(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(""), 6000);
  }, []);

  // Open the draft for the chosen night and follow it live, so several phones see each other's submissions.
  useEffect(() => {
    let cancelled = false;
    setDraft(blankDraft(date));
    setEdits({});
    setOpenOverride({});
    setDirtyShared(false);
    setLoadErr(null);

    const ch = supabase
      .channel(`draft-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "handover_drafts", filter: `service_date=eq.${date}` }, (p) => {
        if (p.eventType !== "DELETE" && p.new) setDraft(normalise(p.new as DraftRow));
      })
      .subscribe();

    (async () => {
      const read = () => supabase.from("handover_drafts").select("*").eq("service_date", date).maybeSingle();
      let { data, error } = await read();
      if (cancelled) return;
      if (error) { setLoadErr(error.message); return; }
      if (!data) {
        const { data: prev } = await supabase.from("handovers").select("*").eq("service_date", date).maybeSingle();
        const seed = prev ? seedFromHandover(prev as HandoverRow) : blankDraft(date);
        const ins = await supabase.from("handover_drafts").upsert(seed, { onConflict: "service_date", ignoreDuplicates: true });
        if (cancelled) return;
        if (ins.error) { setLoadErr(ins.error.message); return; }
        ({ data, error } = await read());
        if (cancelled) return;
        if (error) { setLoadErr(error.message); return; }
        if (!data) data = seed;
      }
      setDraft(normalise(data as DraftRow));
    })();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [supabase, date, attempt]);

  // Shared notes follow the draft unless this person has started typing in them.
  useEffect(() => {
    if (!dirtyShared) setShared({ ...BLANK_SHARED, ...draft.shared });
  }, [draft.shared, dirtyShared]);

  const published = draft.status === "published";
  const booked = draft.booked;

  // Everything a room block shows, with this person's unsent typing laid over the stored draft.
  const view = (k: RoomKey) => {
    const r = draft.rooms[k] || {};
    const bk = booked?.rooms?.[k];
    const closed = !!r.closed && !(bk && bk.reservations > 0 && !r.submittedAt && !r.closedByHand);
    const e = edits[k] || {};
    const storedCovers = r.covers || (!r.submittedAt && bk ? bk.covers : 0) || 0;
    const covers = e.covers ?? (storedCovers ? String(storedCovers) : "");
    return {
      r, bk, closed,
      by: e.by ?? (r.by || ""),
      covers,
      notes: e.notes ?? (r.notes || ""),
      num: Number(covers || 0),
      sent: !!r.submittedAt,
    };
  };

  const states = ROOM_KEYS.map((k) => ({ k, ...view(k) }));
  const openRooms = states.filter((s) => !s.closed);
  const submittedCount = openRooms.filter((s) => s.sent).length;
  const total = openRooms.reduce((a, s) => a + s.num, 0);

  const setEdit = (k: RoomKey, p: Edit) => setEdits((cur) => ({ ...cur, [k]: { ...cur[k], ...p } }));

  // Writes to the shared draft are partial: read the rooms, merge one room, write back.
  // A room opens or collapses by its state (unsent and open: open; otherwise collapsed) until someone toggles it by hand.
  const clearOpen = (k: RoomKey) => setOpenOverride((cur) => { const n = { ...cur }; delete n[k]; return n; });

  async function patchRoom(k: RoomKey, part: RoomPart) {
    const { data, error } = await supabase.from("handover_drafts").select("rooms").eq("service_date", date).single();
    if (error) throw new Error(error.message);
    const rooms = { ...(data.rooms || {}), [k]: { ...(data.rooms?.[k] || {}), ...part } };
    const { error: e2 } = await supabase.from("handover_drafts").update({ rooms }).eq("service_date", date);
    if (e2) throw new Error(e2.message);
    setDraft((d) => ({ ...d, rooms: { ...d.rooms, [k]: { ...d.rooms[k], ...part } } }));
  }

  async function toggleClosed(k: RoomKey, closed: boolean) {
    try { await patchRoom(k, { closed, closedByHand: true }); clearOpen(k); }
    catch (err) { toast("Could not save: " + (err as Error).message); }
  }

  async function submitRoom(k: RoomKey) {
    const s = view(k);
    if (!s.by) { toast(`Pick who is reporting for ${k} before submitting.`); document.getElementById(`by-${k}`)?.focus(); return; }
    const part: RoomPart = { by: s.by, covers: s.num, notes: s.notes.trim(), closed: false, submittedAt: new Date().toISOString() };
    try {
      await patchRoom(k, part);
      clearOpen(k);
      setEdits((cur) => { const n = { ...cur }; delete n[k]; return n; });
      toast(cap(k) + " submitted.");
    } catch (err) { toast("Could not submit: " + (err as Error).message); }
  }

  async function pullSquare() {
    setSqBusy(true);
    setSqErr(null);
    try {
      const res = await fetch(`/api/square/night?date=${date}`, { signal: AbortSignal.timeout(65000), cache: "no-store" });
      if (!(res.headers.get("content-type") || "").includes("json")) throw new Error("you have been signed out. Reload and sign in again");
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const sq = j.summary as SquareSummary;
      setDraft((d) => ({ ...d, square: sq }));
      const { error } = await supabase.from("handover_drafts").update({ square: sq }).eq("service_date", date);
      if (error) throw new Error("pulled, but could not save it to the draft: " + error.message);
    } catch (err) {
      const e = err as Error;
      setSqErr(e.name === "TimeoutError" ? "Square took longer than a minute. Try again." : "Square did not answer: " + e.message);
    }
    setSqBusy(false);
  }

  const setField = (f: keyof Shared, v: string) => { setDirtyShared(true); setShared((s) => ({ ...s, [f]: v })); };
  const readShared = (): Required<Shared> => ({
    vips: shared.vips.trim(), low: shared.low.trim(), out: shared.out.trim(),
    notes: shared.notes.trim(), todo: shared.todo.trim(), haiku: shared.haiku.trim(),
  });

  async function saveDraft() {
    const sh = readShared();
    const { error } = await supabase.from("handover_drafts").update({ shared: sh }).eq("service_date", date);
    if (error) { toast("Could not save: " + error.message); return; }
    setDraft((d) => ({ ...d, shared: sh }));
    setDirtyShared(false);
    toast("Draft saved.");
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const mgr = author;
    if (!mgr) { toast("Pick the handover author first."); document.getElementById("author")?.focus(); return; }
    const sh = readShared();
    const rooms: Record<string, HandoverRoom> = {};
    states.forEach((s) => {
      rooms[s.k] = { open: !s.closed, covers: s.num, notes: s.notes, by: edits[s.k]?.by ?? s.r.by ?? "" };
    });
    const openItems = items.filter((i) => i.status !== "done");
    const postedAt = new Date().toISOString();
    const row = {
      service_date: date, author: mgr, posted_at: postedAt,
      total_covers: Object.values(rooms).reduce((a, r) => a + (r.open ? r.covers || 0 : 0), 0),
      rooms, vips: sh.vips, low: lines(sh.low), out: lines(sh.out), notes: sh.notes, todo: sh.todo, haiku: sh.haiku,
      open_maintenance: openItems.map((i) => i.title), square: draft.square || null, booked: draft.booked || null,
    };
    setPublishing(true);
    toast("Saving…");
    const saved = await supabase.from("handovers").upsert(row, { onConflict: "service_date" });
    if (saved.error) { toast("Could not save the handover: " + saved.error.message); setPublishing(false); return; }
    const upd = await supabase.from("handover_drafts")
      .update({ shared: sh, status: "published", published_by: mgr, published_at: postedAt }).eq("service_date", date);
    if (upd.error) { toast("Saved to the log, but the draft was not marked published: " + upd.error.message); setPublishing(false); return; }
    setDraft((d) => ({ ...d, shared: sh, status: "published", published_by: mgr, published_at: postedAt }));
    setDirtyShared(false);
    toast("Saved. Posting to Slack…");
    try {
      const res = await fetch("/api/slack/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, target }), signal: AbortSignal.timeout(40000),
      });
      if (!(res.headers.get("content-type") || "").includes("json")) throw new Error("you have been signed out. Reload and sign in again");
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast(`Published and posted to ${CHANNEL_LABEL[target]}.`);
    } catch (err) {
      toast("Saved to the log, but the Slack post did not go out: " + (err as Error).message + ".");
    }
    setPublishing(false);
  }

  const menuList = menuNames(menu);
  const lowP = statusParts(shared.low, menuList);
  const outP = statusParts(shared.out, menuList);
  const sq = draft.square;
  const sqSub = sqBusy ? "Pulling…" : sqErr ?? (sq ? `${sq.totals.orders} orders, pulled ${timeHM(sq.pulledAt)}` : "Not pulled yet");

  return (
    <section>
      {loadErr && (
        <div className="ho-err" role="alert">
          <span>Could not open tonight&apos;s draft: {loadErr}.</span>
          <button type="button" className="ho-btn ho-sm" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      )}

      <div className="ho-stack">
        <div className="ho-head">
          <div className="ho-hl">
            <h1>{dateTitle(date)}</h1>
            {pickDate ? (
              <input type="date" id="f-date" aria-label="Service date" required autoFocus value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)} onBlur={() => setPickDate(false)} />
            ) : (
              <button type="button" className="ho-btn ho-sm ho-quiet" onClick={() => setPickDate(true)}>Change date</button>
            )}
            <span className="ho-caption">
              {published && draft.published_at ? `Published by ${draft.published_by} at ${timeHM(draft.published_at)}` : "Draft"}
            </span>
          </div>
          <div className="ho-author">
            <label className="ho-caption" htmlFor="author">Handover author</label>
            <select id="author" value={author} onChange={(e) => setAuthor(e.target.value)}>
              <option value="">Select author</option>
              {(author && !people.includes(author) ? [author, ...people] : people).map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button type="button" className="ho-btn ho-sm ho-pull" disabled={sqBusy} onClick={pullSquare}>Pull tonight&apos;s sales from Square</button>
        </div>

        <section className="ho-module ho-mstack" aria-labelledby="ho-tonight-h">
          <div className="ho-secthead"><h2 className="ho-sectlabel" id="ho-tonight-h">Tonight</h2></div>
          <div className="ho-night">
            <div><span className="ho-display ho-num">{total}</span><span className="ho-label">Total covers</span></div>
            <div><span className="ho-display ho-num">{booked ? booked.all?.covers ?? 0 : "None"}</span><span className="ho-label" title="Booked in SevenRooms">Booked<span className="ho-lx"> in SevenRooms</span></span></div>
            {sq && (
              <>
                <div><span className="ho-display ho-num">{eur(sq.totals.net)}</span><span className="ho-label">Net sales</span></div>
                <div><span className="ho-display ho-num">{eur(sq.totals.gross)}</span><span className="ho-label">Gross</span></div>
                <div><span className="ho-display ho-num">{eur(sq.totals.tips)}</span><span className="ho-label">Tips</span></div>
                <div><span className="ho-display ho-num">{sq.totals.orders}</span><span className="ho-label">Orders</span></div>
              </>
            )}
          </div>

          <div className="ho-sq">
            <span className="ho-caption" aria-live="polite">{sqSub}</span>
            <div className="ho-sq-out">
              {sq && (
                <>
                  <p className="ho-caption" style={{ margin: 0 }}>
                    Discounts {eur(sq.totals.discount)} · Tax {eur(sq.totals.tax)} · Card {eur(sq.totals.card)} · Cash {eur(sq.totals.cash)}
                    {sq.totals.otherTender ? " · Other " + eur(sq.totals.otherTender) : ""}
                  </p>
                  <table className="ho-sqt">
                    <thead><tr><th>Room</th><th className="ho-n">Tables</th><th className="ho-n">Checks</th><th className="ho-n">Gross</th><th className="ho-n">Tips</th></tr></thead>
                    <tbody>
                      {(["summer", "spring", "autumn", "other"] as const).filter((k) => sq.rooms[k]?.orders).map((k) => (
                        <tr key={k}>
                          <td>{cap(k)}</td><td className="ho-n">{sq.rooms[k].tables}</td><td className="ho-n">{sq.rooms[k].orders}</td>
                          <td className="ho-n">{eur(sq.rooms[k].gross)}</td><td className="ho-n">{eur(sq.rooms[k].tips)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="ho-sqt">
                    <thead><tr><th>Category</th><th className="ho-n">Items</th><th className="ho-n">Gross</th></tr></thead>
                    <tbody>{sq.categories.map((c) => <tr key={c.name}><td>{c.name}</td><td className="ho-n">{c.qty}</td><td className="ho-n">{eur(c.gross)}</td></tr>)}</tbody>
                  </table>
                  <table className="ho-sqt">
                    <thead><tr><th>Item</th><th className="ho-n">Qty</th><th className="ho-n">Gross</th></tr></thead>
                    <tbody>{[...sq.top].sort((x, y) => y.qty - x.qty).map((i) => <tr key={i.name}><td>{i.name}</td><td className="ho-n">{i.qty}</td><td className="ho-n">{eur(i.gross)}</td></tr>)}</tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="ho-module" aria-labelledby="ho-rooms-h">
          <div className="ho-secthead">
            <h2 className="ho-sectlabel" id="ho-rooms-h">Rooms</h2>
            <span className="ho-caption">
              {(openRooms.length ? `${submittedCount} of ${openRooms.length} open room${openRooms.length > 1 ? "s" : ""} submitted` : "All rooms closed") +
                (booked ? ` · ${booked.all?.covers ?? 0} covers booked in SevenRooms` : "")}
            </span>
          </div>
          <div className="ho-rooms">
            {ROOMS.map((name) => {
              const k = name.toLowerCase() as RoomKey;
              const s = view(k);
              const r = s.r;
              const sqr = sq?.rooms?.[k];
              const isOpen = openOverride[k] ?? (!s.closed && !s.sent);
              const summary = s.closed
                ? "Closed"
                : s.sent
                  ? `${r.covers || 0} cover${r.covers === 1 ? "" : "s"}, reported by ${r.by || "someone"}, submitted ${timeHM(r.submittedAt as string)}`
                  : "Not submitted yet" + (s.bk ? `, ${s.bk.covers} booked in SevenRooms` : "");
              return (
                <div key={k} className={`ho-room ${s.closed ? "ho-off" : ""} ${s.sent ? "ho-sent" : ""} ${isOpen ? "ho-open" : ""}`}>
                  <div className="ho-rh" onClick={() => setOpenOverride((cur) => ({ ...cur, [k]: !isOpen }))}>
                    <h3>
                      <button type="button" className="ho-rtoggle" aria-expanded={isOpen} aria-controls={`room-${k}`} id={`rh-${k}`}>
                        <span className="ho-rname">{name}</span>
                        <span className="ho-body-s ho-rsum">{summary}</span>
                      </button>
                    </h3>
                    <label onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={s.closed} onChange={(e) => toggleClosed(k, e.target.checked)} /> Closed
                    </label>
                    <svg className="ho-chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="ho-rbody" id={`room-${k}`} role="region" aria-labelledby={`rh-${k}`}>
                    <div className="ho-rin">
                      <div className="ho-r2">
                        <div className="ho-by">
                          <label className="ho-caption" htmlFor={`by-${k}`}>Reported by</label>
                          <select id={`by-${k}`} value={s.by} onChange={(e) => setEdit(k, { by: e.target.value })}>
                            <option value="">Select who is reporting</option>
                            {(s.by && !people.includes(s.by) ? [s.by, ...people] : people).map((p) => <option key={p}>{p}</option>)}
                          </select>
                        </div>
                        <div className="ho-cv">
                          <input
                            type="number" min={0} inputMode="numeric" placeholder="0" className="ho-num"
                            aria-label={`${name} covers`} value={s.covers}
                            onChange={(e) => setEdit(k, { covers: e.target.value })}
                          />
                          <span className="ho-caption">covers</span>
                        </div>
                        <span className="ho-sqhint">
                          {s.bk
                            ? `SevenRooms: ${s.bk.covers} covers booked on ${s.bk.reservations} reservation${s.bk.reservations === 1 ? "" : "s"}, as of ${booked?.asOf || "the afternoon summary"}. Correct it to what actually came in.`
                            : booked && !s.closed ? "SevenRooms: nothing booked in this room, walk-ins only." : ""}
                        </span>
                        <span className="ho-sqhint">
                          {sqr && sqr.orders ? `Square: ${sqr.tables} table${sqr.tables === 1 ? "" : "s"}, ${sqr.orders} check${sqr.orders === 1 ? "" : "s"}, ${eur(sqr.gross)}` : ""}
                        </span>
                      </div>
                      <textarea
                        placeholder={`Notes for ${name}`} aria-label={`${name} notes`} value={s.notes}
                        onChange={(e) => setEdit(k, { notes: e.target.value })}
                      />
                      <div className="ho-sub">
                        <button type="button" className="ho-btn ho-sm ho-primary" onClick={() => submitRoom(k)}>
                          {(r.submittedAt ? "Resubmit " : "Submit ") + name}
                        </button>
                        <span className="ho-stamp">
                          {r.submittedAt ? `Submitted by ${r.by || "someone"} at ${timeHM(r.submittedAt)}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <form id="handover-form" className="ho-module ho-mstack" onSubmit={publish} autoComplete="off">
          <div className="ho-secthead">
            <h2 className="ho-sectlabel">Handover</h2>
            <span className="ho-caption">
              {published
                ? "Already published. Publishing again reposts to Slack."
                : submittedCount < openRooms.length
                  ? `Waiting on ${openRooms.length - submittedCount} room${openRooms.length - submittedCount > 1 ? "s" : ""}. You can still publish without them.`
                  : "All rooms in. Add the shared notes and publish."}
            </span>
          </div>

          <div className="ho-f"><label htmlFor="f-vips">VIPs</label>
            <textarea id="f-vips" value={shared.vips} onChange={(e) => setField("vips", e.target.value)} placeholder="Who came in, who they were with, anything to remember next time" /></div>
          <div className="ho-f">
            <span className="ho-label">Menu status</span>
            <MenuStatusList
              menu={menu} failed={menuFailed} onRetry={retryMenu} low={shared.low} out={shared.out}
              onChange={(l, o) => { setDirtyShared(true); setShared((s) => ({ ...s, low: l, out: o })); }}
            />
          </div>
          <div className="ho-grid2">
            <div className="ho-f"><label htmlFor="f-85"><span className="ho-chip ho-c85">85</span>Running low, off the menu</label>
              <textarea id="f-85" value={lowP.extras} onChange={(e) => setField("low", composeStatus(lowP.chosen, e.target.value))} placeholder="One per line, e.g. LEMON, top up batch tomorrow" /></div>
            <div className="ho-f"><label htmlFor="f-86"><span className="ho-chip ho-c86">86</span>Out, off the menu</label>
              <textarea id="f-86" value={outP.extras} onChange={(e) => setField("out", composeStatus(outP.chosen, e.target.value))} placeholder="One per line" /></div>
          </div>
          <div className="ho-f">
            <label htmlFor="f-notes">Notes</label>
            <textarea id="f-notes" style={{ minHeight: 120 }} value={shared.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="What happened, what the next shift needs to know" />
            <div className="ho-flag">
              <span className="ho-body-s">Something broken, leaking or missing? Log it once and it stays on the list.</span>
              <div className="ho-r">
                <input type="text" value={flagTitle} onChange={(e) => setFlagTitle(e.target.value)} placeholder="e.g. Spring fridge not holding temperature" aria-label="Maintenance item" />
                <select aria-label="Where" value={flagLoc} onChange={(e) => setFlagLoc(e.target.value)}>{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select>
                <button
                  type="button" className="ho-btn ho-sm"
                  onClick={async () => {
                    const t = flagTitle.trim();
                    if (!t) return;
                    const err = await addItem(t, flagLoc);
                    if (err) toast("Could not add the item: " + err);
                    else { setFlagTitle(""); toast("Added to the maintenance list."); }
                  }}
                >
                  Add to maintenance
                </button>
              </div>
            </div>
          </div>
          <div className="ho-f"><label htmlFor="f-todo">To do and MEP for tomorrow</label>
            <textarea id="f-todo" value={shared.todo} onChange={(e) => setField("todo", e.target.value)} placeholder="One per line" /></div>
          <div className="ho-f ho-haiku"><label htmlFor="f-haiku">Handover haiku</label>
            <textarea id="f-haiku" value={shared.haiku} onChange={(e) => setField("haiku", e.target.value)} placeholder="Three lines, as ever" /></div>
        </form>

        <section className="ho-module ho-mstack" aria-labelledby="ho-maint-h">
          <div className="ho-secthead"><h2 className="ho-sectlabel" id="ho-maint-h">Maintenance</h2></div>
          <MaintenancePanel />
        </section>

        <section className="ho-module ho-commitmod" aria-label="Save and publish">
          <div className="ho-commit">
            <div className="ho-commit-msg">
              <span className="ho-caption">
                {published && draft.published_at ? `Published by ${draft.published_by} at ${timeHM(draft.published_at)}` : "Draft"}
              </span>
              <span className="ho-toast ho-body-s" aria-live="polite">{toastText}</span>
            </div>
            <div className="ho-commit-btns">
              <button type="button" className="ho-btn ho-act" onClick={saveDraft}>Save draft</button>
              <button type="submit" form="handover-form" className="ho-btn ho-act ho-primary" disabled={publishing}>{testMode ? "Publish (test to me)" : published ? "Publish again" : "Publish handover"}</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
