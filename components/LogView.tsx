"use client";

import { useCallback, useEffect, useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import { useSkeleton } from "@/components/useSkeleton";
import { eur, fmtDate, longDate } from "@/lib/format";
import { ROOMS, type HandoverRow } from "@/lib/types";

export function LogView() {
  const { supabase } = useHandovers();
  const [rows, setRows] = useState<HandoverRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { skeleton, ready } = useSkeleton(rows === null && !failed);

  const load = useCallback(async () => {
    setFailed(null);
    setRows(null);
    const timer = setTimeout(() => setFailed("it took longer than 10 seconds"), 10000);
    const { data, error } = await supabase
      .from("handovers").select("*").order("service_date", { ascending: false }).limit(60);
    clearTimeout(timer);
    if (error) setFailed(error.message);
    else { setFailed(null); setRows((data || []) as HandoverRow[]); }
  }, [supabase]);

  useEffect(() => { load(); }, [load, attempt]);

  return (
    <section>
      <h1>Handover log</h1>
      <p className="ho-lede">Every night, newest first. Each one records what was open on the maintenance list when it was posted.</p>
      <div style={{ marginTop: 32 }}>
        {failed ? (
          <div className="ho-err">
            <span>The log did not load: {failed}.</span>
            <button type="button" className="ho-btn ho-sm" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        ) : skeleton ? (
          <div className="ho-skel" aria-busy="true" aria-live="polite">
            <span className="ho-sr">Loading</span>
            <i aria-hidden="true" style={{ height: 40, width: "40%" }} />
            <i aria-hidden="true" style={{ height: 120 }} />
            <i aria-hidden="true" style={{ height: 40, width: "40%" }} />
            <i aria-hidden="true" style={{ height: 120 }} />
          </div>
        ) : !ready || !rows ? null : rows.length === 0 ? (
          <p className="ho-empty">No handovers posted yet. Tonight&apos;s will be the first.</p>
        ) : (
          rows.map((h) => {
            const r = h.rooms || {};
            return (
              <article className="ho-ho" key={h.service_date}>
                <div className="ho-hd">
                  <h2>{fmtDate(h.service_date)}</h2>
                  <span className="ho-caption">{longDate(h.service_date)}, posted by {h.author}</span>
                  <span className="ho-cov ho-num"><b>{h.total_covers ?? 0}</b> covers</span>
                </div>
                <div className="ho-rms">
                  {ROOMS.map((n) => {
                    const x = r[n.toLowerCase() as "summer"] || {};
                    return x.open === false ? (
                      <div className="ho-off" key={n}><h3>{n}</h3><span className="ho-n">Closed</span></div>
                    ) : (
                      <div key={n}>
                        <h3>{n}</h3>
                        <span className="ho-n ho-num">{x.covers ?? 0} covers{x.by ? ", " + x.by : ""}</span>
                        {x.notes ? <p>{x.notes}</p> : null}
                      </div>
                    );
                  })}
                </div>
                <dl className="ho-kv">
                  {h.vips ? <><dt className="ho-label">VIPs</dt><dd>{h.vips}</dd></> : null}
                  {h.low?.length ? <><dt className="ho-label">85s</dt><dd className="ho-stock ho-s85">{h.low.map((x, i) => <span key={i}>{x}</span>)}</dd></> : null}
                  {h.out?.length ? <><dt className="ho-label">86s</dt><dd className="ho-stock ho-s86">{h.out.map((x, i) => <span key={i}>{x}</span>)}</dd></> : null}
                  {h.notes ? <><dt className="ho-label">Notes</dt><dd>{h.notes}</dd></> : null}
                  {h.todo ? <><dt className="ho-label">To do</dt><dd>{h.todo}</dd></> : null}
                  {h.square ? (
                    <>
                      <dt className="ho-label">Square</dt>
                      <dd>
                        Net {eur(h.square.totals.net)}, gross {eur(h.square.totals.gross)}, tips {eur(h.square.totals.tips)}, {h.square.totals.orders} orders. {h.square.categories.map((c) => c.name + " " + c.qty).join(", ")}
                      </dd>
                    </>
                  ) : null}
                  {h.open_maintenance?.length ? (
                    <>
                      <dt className="ho-label">Open then</dt>
                      <dd>{h.open_maintenance.length} maintenance item{h.open_maintenance.length > 1 ? "s" : ""}: {h.open_maintenance.join("; ")}</dd>
                    </>
                  ) : null}
                </dl>
                {h.haiku ? <p className="ho-haiku-out">{h.haiku}</p> : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
