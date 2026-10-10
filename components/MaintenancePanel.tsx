"use client";

import { useRef, useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import { useSkeleton } from "@/components/useSkeleton";
import { daysSince, fmtDate } from "@/lib/format";
import { LOCATIONS, type MaintenanceItem } from "@/lib/types";

const STATUS_WORD = { open: "Open", progress: "In hand", done: "Done" } as const;

/** The maintenance list. Used as the right rail (>= 840px) and as its own section below that. */
export function MaintenancePanel() {
  const { items, loaded, failed, filter, setFilter, addItem, setItemStatus, addUpdate } = useHandovers();
  const { skeleton, ready } = useSkeleton(!loaded && !failed);
  const [dir, setDir] = useState<"r" | "l" | "">("");
  const prevIdx = useRef(0);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const open = items.filter((i) => i.status === "open");
  const prog = items.filter((i) => i.status === "progress");
  const active = [...open, ...prog];
  const oldest = active.length ? Math.max(...active.map((i) => daysSince(i.reported_on))) : 0;
  const show: MaintenanceItem[] =
    filter === "done"
      ? items.filter((i) => i.status === "done").sort((a, b) => (b.done_on || "").localeCompare(a.done_on || ""))
      : [...active].sort((a, b) => a.reported_on.localeCompare(b.reported_on));

  const pick = (f: "active" | "done") => {
    const idx = f === "done" ? 1 : 0;
    setDir(idx > prevIdx.current ? "r" : idx < prevIdx.current ? "l" : "");
    prevIdx.current = idx;
    setFilter(f);
  };
  const run = async (p: Promise<string | null>, what: string) => {
    const err = await p;
    setMsg(err ? `Could not ${what}: ${err}` : "");
  };

  return (
    <div>
      <div className="ho-mtop">
        <div className="ho-summ">
          <div><span className="ho-display ho-num">{open.length}</span><span className="ho-label">Open</span></div>
          <div><span className="ho-display ho-num">{prog.length}</span><span className="ho-label">In hand</span></div>
          <div><span className="ho-display ho-num">{oldest}</span><span className="ho-label">Oldest, days</span></div>
        </div>
        <div className="ho-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={filter === "active"} onClick={() => pick("active")}>Active</button>
          <button type="button" aria-pressed={filter === "done"} onClick={() => pick("done")}>Done</button>
        </div>
      </div>

      <div className="ho-mviewport">
        <div key={filter} className={`ho-mlist ${dir ? `ho-swap-in-${dir}` : ""}`}>
          {failed ? (
            <div className="ho-err">
              <span>The maintenance list did not load: {failed}.</span>
              <button type="button" className="ho-btn ho-sm" onClick={() => location.reload()}>Retry</button>
            </div>
          ) : skeleton ? (
            <div className="ho-skel" aria-busy="true" aria-live="polite">
              <span className="ho-sr">Loading</span>
              {[0, 1, 2, 3, 4].map((n) => <i key={n} aria-hidden="true" />)}
            </div>
          ) : !ready ? null : show.length === 0 ? (
            <p className="ho-empty">
              {filter === "done" ? "Nothing has been marked done yet." : "Nothing is open. Anything broken tonight goes in the box below."}
            </p>
          ) : (
            show.map((i) => {
              const age = daysSince(i.reported_on);
              return (
                <article key={i.id} className={`ho-mi ho-${i.status}`}>
                  <button
                    type="button"
                    className="ho-tick"
                    aria-label={`${i.status === "done" ? "Reopen" : "Mark done"}: ${i.title}`}
                    onClick={() => run(setItemStatus(i, i.status === "done" ? "open" : "done"), "update the item")}
                  >
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 6.5l2.6 2.5L10 3.5" /></svg>
                  </button>
                  <div className="ho-b">
                    <p className="ho-t">{i.title}</p>
                    <p className="ho-m">
                      <span className={`ho-status ho-${i.status}`}>{STATUS_WORD[i.status] ?? i.status}</span>
                      <span>{i.location || ""}</span>
                      <span>{i.reported_by || ""}, {fmtDate(i.reported_on)}</span>
                      {i.status === "done" ? (
                        <span>fixed {fmtDate(i.done_on || i.reported_on)}{i.done_by ? " by " + i.done_by : ""}</span>
                      ) : (
                        <span className={`ho-age ho-num ${age >= 14 ? "ho-old" : ""}`}>
                          {age === 0 ? "today" : age === 1 ? "1 day" : age + " days"}{age >= 14 ? ", overdue" : ""}
                        </span>
                      )}
                    </p>
                    {(i.updates || []).length > 0 && (
                      <ul>
                        {i.updates.slice(-3).map((u, n) => <li key={n}>{fmtDate(u.on)} {u.by}: {u.text}</li>)}
                      </ul>
                    )}
                    <div className="ho-ops">
                      {i.status === "open" && (
                        <button type="button" className="ho-btn ho-sm" onClick={() => run(setItemStatus(i, "progress"), "update the item")}>Take it on</button>
                      )}
                      <button
                        type="button"
                        className="ho-btn ho-sm ho-quiet"
                        onClick={() => {
                          const text = window.prompt("Update on: " + i.title);
                          if (text && text.trim()) run(addUpdate(i, text.trim()), "save the update");
                        }}
                      >
                        Add update
                      </button>
                      {i.status !== "done" ? (
                        <button type="button" className="ho-btn ho-sm ho-quiet" onClick={() => run(setItemStatus(i, "done"), "update the item")}>Mark done</button>
                      ) : (
                        <button type="button" className="ho-btn ho-sm ho-quiet" onClick={() => run(setItemStatus(i, "open"), "update the item")}>Reopen</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
      {msg && <p className="ho-err" role="alert">{msg}</p>}

      <form
        className="ho-madd"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const fd = new FormData(f);
          const title = String(fd.get("title") || "").trim();
          if (!title) return;
          setBusy(true);
          const err = await addItem(title, String(fd.get("loc") || "Bar"));
          setBusy(false);
          if (err) setMsg("Could not add the item: " + err);
          else { setMsg(""); f.reset(); }
        }}
      >
        <span className="ho-label">Add an item</span>
        <div className="ho-r">
          <input type="text" name="title" placeholder="What needs fixing" required aria-label="What needs fixing" />
          <select name="loc" aria-label="Where">{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select>
          <button className="ho-btn ho-sm ho-primary" type="submit" disabled={busy}>Add</button>
        </div>
      </form>
    </div>
  );
}
