"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { serviceDateNow } from "@/lib/paris";
import { PEOPLE, type MaintenanceItem, type MaintenanceStatus } from "@/lib/types";

type LiveStatus = "Connecting" | "Live" | "Error" | "Not loaded";

interface Ctx {
  supabase: SupabaseClient;
  me: string;
  people: string[];
  author: string;
  setAuthor: (a: string) => void;
  items: MaintenanceItem[];
  loaded: boolean;
  failed: string | null;
  status: LiveStatus;
  filter: "active" | "done";
  setFilter: (f: "active" | "done") => void;
  addItem: (title: string, location: string) => Promise<string | null>;
  setItemStatus: (it: MaintenanceItem, status: MaintenanceStatus) => Promise<string | null>;
  addUpdate: (it: MaintenanceItem, text: string) => Promise<string | null>;
}

const C = createContext<Ctx | null>(null);
export const useHandovers = () => {
  const v = useContext(C);
  if (!v) throw new Error("useHandovers outside HandoversProvider");
  return v;
};

const AUTHOR_KEY = "dv-ho-author";

// "Alex Francis" becomes "Alex" when Alex is on the list; otherwise the name is used as given.
function resolveMe(name: string): string {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  return PEOPLE.find((p) => p.toLowerCase() === first) ?? name;
}

export function HandoversProvider({ displayName, children }: { displayName: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const me = useMemo(() => resolveMe(displayName), [displayName]);
  const people = useMemo(() => (PEOPLE.includes(me) ? PEOPLE : [me, ...PEOPLE]), [me]);
  const [author, setAuthorState] = useState(me);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>("Connecting");
  const [filter, setFilter] = useState<"active" | "done">("active");
  const loadedRef = useRef(false);

  // A handover author picked by hand on this device wins over the signed-in name.
  useEffect(() => {
    try {
      const a = localStorage.getItem(AUTHOR_KEY);
      if (a && people.includes(a)) setAuthorState(a);
    } catch { /* storage unavailable */ }
  }, [people]);
  const setAuthor = useCallback((a: string) => {
    setAuthorState(a);
    try { localStorage.setItem(AUTHOR_KEY, a); } catch { /* storage unavailable */ }
  }, []);

  const upsertLocal = useCallback((row: MaintenanceItem) => {
    setItems((cur) => (cur.some((i) => i.id === row.id) ? cur.map((i) => (i.id === row.id ? row : i)) : [...cur, row]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const giveUp = setTimeout(() => {
      if (!loadedRef.current) {
        setFailed("it took longer than 10 seconds");
        setStatus("Not loaded");
      }
    }, 10000);

    const load = async () => {
      const { data, error } = await supabase.from("maintenance_items").select("*").order("reported_on", { ascending: true });
      if (cancelled) return;
      if (error) {
        setFailed(error.message);
        setStatus("Error");
        return;
      }
      loadedRef.current = true;
      setItems((data || []) as MaintenanceItem[]);
      setLoaded(true);
      setFailed(null);
    };

    const ch = supabase
      .channel("maintenance-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_items" }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string }).id;
          if (id) setItems((cur) => cur.filter((i) => i.id !== id));
        } else {
          upsertLocal(p.new as MaintenanceItem);
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus("Live");
          load();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("Error");
        }
      });
    load();

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      supabase.removeChannel(ch);
    };
  }, [supabase, upsertLocal]);

  const addItem = useCallback(async (title: string, location: string) => {
    const { data, error } = await supabase
      .from("maintenance_items")
      .insert({ title, location, reported_by: author, reported_on: serviceDateNow(), status: "open", updates: [] })
      .select()
      .single();
    if (error) return error.message;
    upsertLocal(data as MaintenanceItem);
    return null;
  }, [supabase, author, upsertLocal]);

  const patch = useCallback(async (it: MaintenanceItem, p: Partial<MaintenanceItem>) => {
    const { data, error } = await supabase.from("maintenance_items").update(p).eq("id", it.id).select().single();
    if (error) return error.message;
    upsertLocal(data as MaintenanceItem);
    return null;
  }, [supabase, upsertLocal]);

  const setItemStatus = useCallback((it: MaintenanceItem, st: MaintenanceStatus) => {
    const today = serviceDateNow();
    const updates = [...(it.updates || []), { on: today, by: author, text: st === "done" ? "Marked done" : st === "progress" ? "Taken on" : "Reopened" }];
    const p: Partial<MaintenanceItem> = { status: st, updates };
    if (st === "done") { p.done_on = today; p.done_by = author; }
    if (st !== "done") { p.done_on = null; p.done_by = null; }
    return patch(it, p);
  }, [author, patch]);

  const addUpdate = useCallback((it: MaintenanceItem, text: string) => {
    return patch(it, { updates: [...(it.updates || []), { on: serviceDateNow(), by: author, text }] });
  }, [author, patch]);

  const value: Ctx = {
    supabase, me, people, author, setAuthor, items, loaded, failed, status,
    filter, setFilter, addItem, setItemStatus, addUpdate,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
