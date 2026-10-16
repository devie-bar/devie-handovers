"use client";

import { useState } from "react";
import { useHandovers } from "@/components/HandoversProvider";
import type { SectionKey } from "@/lib/types";

/**
 * One section's nightly checklist: a Library-style list of hairline rows with a checkbox each. Which items are
 * ticked is the night's own state (held by the caller, saved with the draft); the items themselves are shared
 * across nights and edited here by admins only.
 */
export function Checklist({ section, title, ticked, onChange }: {
  section: SectionKey; title: string; ticked: string[]; onChange: (ids: string[]) => void;
}) {
  const { checklist, checklistFailed, retryChecklist, isAdmin, addChecklistItem, renameChecklistItem, moveChecklistItem, deactivateChecklistItem } = useHandovers();
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [err, setErr] = useState("");
  const items = checklist.filter((i) => i.section === section && i.active).sort((a, b) => a.sort - b.sort);
  const done = items.filter((i) => ticked.includes(i.id)).length;
  const run = async (p: Promise<string | null>) => { const e = await p; setErr(e ? "Could not save: " + e : ""); };

  const toggle = (id: string) => onChange(ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]);

  return (
    <section className="ho-check" aria-label={`${title} checklist`}>
      <div className="ho-checkh">
        <h4 className="ho-checklabel">Checklist</h4>
        <span className="ho-caption" aria-live="polite">{items.length ? `${done} of ${items.length}` : ""}</span>
        {isAdmin && (
          <button type="button" className="ho-checkedit" aria-pressed={editing} onClick={() => { setEditing((e) => !e); setErr(""); }}>
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {checklistFailed ? (
        <div className="ho-mfail">
          <span className="ho-caption">Checklist did not load: {checklistFailed}</span>
          <button type="button" className="ho-btn ho-sm" onClick={retryChecklist}>Retry</button>
        </div>
      ) : !editing ? (
        items.length === 0 ? <p className="ho-caption ho-checkempty">No items on this checklist yet.</p> : (
          <ul className="ho-checklist">
            {items.map((i) => {
              const on = ticked.includes(i.id);
              return (
                <li key={i.id}>
                  <label className={"ho-crow" + (on ? " ho-done" : "")}>
                    <input type="checkbox" checked={on} onChange={() => toggle(i.id)} />
                    <span>{i.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          <ul className="ho-checklist">
            {items.map((i, n) => (
              <li key={i.id} className="ho-cedit">
                <input
                  type="text" defaultValue={i.label} aria-label={`Rename ${i.label}`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.label) run(renameChecklistItem(i.id, v)); else e.target.value = i.label; }}
                />
                <button type="button" className="ho-btn ho-sm" disabled={n === 0} aria-label={`Move ${i.label} up`} onClick={() => run(moveChecklistItem(i.id, -1))}>Up</button>
                <button type="button" className="ho-btn ho-sm" disabled={n === items.length - 1} aria-label={`Move ${i.label} down`} onClick={() => run(moveChecklistItem(i.id, 1))}>Down</button>
                <button type="button" className="ho-btn ho-sm" aria-label={`Deactivate ${i.label}`} onClick={() => run(deactivateChecklistItem(i.id))}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="ho-cedit ho-cadd">
            <input
              type="text" value={draftLabel} placeholder="New item" aria-label="New checklist item"
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById(`cadd-${section}`)?.click(); } }}
            />
            <button
              type="button" id={`cadd-${section}`} className="ho-btn ho-sm"
              onClick={() => { const v = draftLabel.trim(); if (v) { setDraftLabel(""); run(addChecklistItem(section, v)); } }}
            >
              Add
            </button>
          </div>
          {err && <p className="ho-caption" style={{ color: "var(--dv-danger)" }} role="alert">{err}</p>}
        </>
      )}
    </section>
  );
}
