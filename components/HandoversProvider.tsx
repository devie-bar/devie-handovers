"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { serviceDateNow } from "@/lib/paris";
import { getCurrentMenu, type CurrentMenu } from "@/lib/menu";
import type { StockCounts } from "@/lib/stock";
import { PEOPLE, type ChecklistItem, type MaintenanceItem, type MaintenanceStatus, type SectionKey } from "@/lib/types";

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
  menu: CurrentMenu | null;
  menuFailed: boolean;
  retryMenu: () => void;
  stock: StockCounts | null;
  stockFailed: string | null;
  retryStock: () => void;
  isAdmin: boolean;
  checklist: ChecklistItem[];
  /** The items a section shows on a service date: the Tasks app's closedown lists if it has any for the section, else the local list. */
  checklistFor: (section: SectionKey, date: string) => { items: ChecklistItem[]; source: "tasks" | "local" };
  checklistFailed: string | null;
  retryChecklist: () => void;
  addChecklistItem: (section: SectionKey, label: string) => Promise<string | null>;
  renameChecklistItem: (id: string, label: string) => Promise<string | null>;
  moveChecklistItem: (id: string, dir: -1 | 1) => Promise<string | null>;
  deactivateChecklistItem: (id: string) => Promise<string | null>;
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

// "Alex Francis" becomes "Alex" when Alex is on the list; otherwise the name is used as given.
function resolveMe(name: string): string {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  return PEOPLE.find((p) => p.toLowerCase() === first) ?? name;
}

export function HandoversProvider({ displayName, isAdmin, children }: { displayName: string; isAdmin: boolean; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const me = useMemo(() => resolveMe(displayName), [displayName]);
  const people = useMemo(() => (PEOPLE.includes(me) ? PEOPLE : [me, ...PEOPLE]), [me]);
  const [author, setAuthorState] = useState("");
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>("Connecting");
  const [filter, setFilter] = useState<"active" | "done">("active");
  const loadedRef = useRef(false);
  const [menu, setMenu] = useState<CurrentMenu | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);

  // The current menu is small and changes rarely: fetch it once per page load, and again only on Retry.
  const retryMenu = useCallback(() => {
    setMenuFailed(false);
    getCurrentMenu(supabase).then(setMenu).catch(() => setMenuFailed(true));
  }, [supabase]);
  useEffect(() => { retryMenu(); }, [retryMenu]);

  // Serves left per drink according to Square, used only to suggest 85 / 86. Nothing is applied automatically.
  const [stock, setStock] = useState<StockCounts | null>(null);
  const [stockFailed, setStockFailed] = useState<string | null>(null);
  const retryStock = useCallback(() => {
    setStockFailed(null);
    fetch("/api/square/stock", { cache: "no-store", signal: AbortSignal.timeout(30000) })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setStock(j.counts as StockCounts); else setStockFailed(j.error || "Square did not answer."); })
      .catch(() => setStockFailed("It took too long or the connection dropped."));
  }, []);
  useEffect(() => { retryStock(); }, [retryStock]);

  // Nightly checklist items. Small, so any change (here or on another phone) just reloads the lot.
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistFailed, setChecklistFailed] = useState<string | null>(null);
  const loadChecklist = useCallback(async () => {
    const { data, error } = await supabase.from("handover_checklists").select("*").order("sort", { ascending: true }).order("created_at", { ascending: true });
    if (error) { setChecklistFailed(error.message); return; }
    setChecklistFailed(null);
    setChecklist((data || []) as ChecklistItem[]);
  }, [supabase]);
  useEffect(() => {
    loadChecklist();
    const ch = supabase
      .channel("handover-checklists")
      .on("postgres_changes", { event: "*", schema: "public", table: "handover_checklists" }, () => { loadChecklist(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, loadChecklist]);
  const activeOf = useCallback((section: string) => checklist.filter((i) => i.section === section && i.active).sort((a, b) => a.sort - b.sort), [checklist]);
  // The Tasks app's closedown lists. A missing section column, a missing table or no access all read as "no lists",
  // which leaves the local checklist in use.
  interface TaskList { id: string; section: string | null; days: unknown; sort_order: number | null }
  interface TaskItem { id: string; list_id: string; title: string; detail: string | null; sort_order: number | null }
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const loadTasks = useCallback(async () => {
    try {
      const l = await supabase.from("task_lists").select("*").eq("active", true).eq("kind", "closedown");
      if (l.error) { setTaskLists([]); setTaskItems([]); return; }
      const lists = ((l.data || []) as TaskList[]).filter((x) => x.section);
      const i = lists.length ? await supabase.from("task_items").select("*").eq("active", true).in("list_id", lists.map((x) => x.id)) : { data: [], error: null };
      if (i.error) { setTaskLists([]); setTaskItems([]); return; }
      setTaskLists(lists);
      setTaskItems((i.data || []) as TaskItem[]);
    } catch { setTaskLists([]); setTaskItems([]); }
  }, [supabase]);
  useEffect(() => {
    loadTasks();
    const ch = supabase
      .channel("task-closedown")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_lists" }, () => { loadTasks(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_items" }, () => { loadTasks(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, loadTasks]);

  const checklistFor = useCallback((section: SectionKey, date: string) => {
    const mine = taskLists.filter((x) => x.section === section);
    if (mine.some((x) => taskItems.some((it) => it.list_id === x.id))) {
      const wd = new Date(date + "T12:00:00Z").getUTCDay(); // 0 = Sunday
      const iso = wd === 0 ? 7 : wd;
      const abbr = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][wd];
      // days is an int[] in Tasks (1 = Monday to 7 = Sunday; 0 also read as Sunday); text names are accepted too.
      const runsToday = (days: unknown) => {
        if (!Array.isArray(days) || days.length === 0) return true;
        return days.some((d) => (typeof d === "number" ? d === iso || (d === 0 && wd === 0) : String(d).trim().toLowerCase().slice(0, 3) === abbr));
      };
      const items = mine
        .filter((x) => runsToday(x.days))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .flatMap((x) => taskItems.filter((it) => it.list_id === x.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
        .map((it, n): ChecklistItem => ({ id: it.id, section, label: it.title, detail: it.detail, sort: n + 1, active: true }));
      return { items, source: "tasks" as const };
    }
    return { items: activeOf(section), source: "local" as const };
  }, [taskLists, taskItems, activeOf]);

  const addChecklistItem = useCallback(async (section: SectionKey, label: string) => {
    const sort = activeOf(section).reduce((m, i) => Math.max(m, i.sort), 0) + 1;
    const { error } = await supabase.from("handover_checklists").insert({ section, label, sort });
    if (error) return error.message;
    await loadChecklist();
    return null;
  }, [supabase, activeOf, loadChecklist]);
  const renameChecklistItem = useCallback(async (id: string, label: string) => {
    const { error } = await supabase.from("handover_checklists").update({ label }).eq("id", id);
    if (error) return error.message;
    await loadChecklist();
    return null;
  }, [supabase, loadChecklist]);
  const deactivateChecklistItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("handover_checklists").update({ active: false }).eq("id", id);
    if (error) return error.message;
    await loadChecklist();
    return null;
  }, [supabase, loadChecklist]);
  // Swap with the neighbour, then renumber the section 1..n so equal sort values can never leave the order ambiguous.
  const moveChecklistItem = useCallback(async (id: string, dir: -1 | 1) => {
    const it = checklist.find((i) => i.id === id);
    if (!it) return null;
    const list = activeOf(it.section);
    const at = list.findIndex((i) => i.id === id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= list.length) return null;
    [list[at], list[to]] = [list[to], list[at]];
    const changed = list.map((i, n) => ({ i, sort: n + 1 })).filter((x) => x.i.sort !== x.sort);
    const res = await Promise.all(changed.map((x) => supabase.from("handover_checklists").update({ sort: x.sort }).eq("id", x.i.id)));
    const bad = res.find((r) => r.error);
    await loadChecklist();
    return bad?.error ? bad.error.message : null;
  }, [supabase, checklist, activeOf, loadChecklist]);

  // The handover author is never prefilled or remembered: each handover, someone picks themselves.
  const setAuthor = useCallback((a: string) => setAuthorState(a), []);

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
      .insert({ title, location, reported_by: author || me, reported_on: serviceDateNow(), status: "open", updates: [] })
      .select()
      .single();
    if (error) return error.message;
    upsertLocal(data as MaintenanceItem);
    return null;
  }, [supabase, author, me, upsertLocal]);

  const patch = useCallback(async (it: MaintenanceItem, p: Partial<MaintenanceItem>) => {
    const { data, error } = await supabase.from("maintenance_items").update(p).eq("id", it.id).select().single();
    if (error) return error.message;
    upsertLocal(data as MaintenanceItem);
    return null;
  }, [supabase, upsertLocal]);

  const setItemStatus = useCallback((it: MaintenanceItem, st: MaintenanceStatus) => {
    const today = serviceDateNow();
    const updates = [...(it.updates || []), { on: today, by: author || me, text: st === "done" ? "Marked done" : st === "progress" ? "Taken on" : "Reopened" }];
    const p: Partial<MaintenanceItem> = { status: st, updates };
    if (st === "done") { p.done_on = today; p.done_by = author || me; }
    if (st !== "done") { p.done_on = null; p.done_by = null; }
    return patch(it, p);
  }, [author, me, patch]);

  const addUpdate = useCallback((it: MaintenanceItem, text: string) => {
    return patch(it, { updates: [...(it.updates || []), { on: serviceDateNow(), by: author || me, text }] });
  }, [author, me, patch]);

  const value: Ctx = {
    supabase, me, people, author, setAuthor, items, loaded, failed, status,
    filter, setFilter, menu, menuFailed, retryMenu, stock, stockFailed, retryStock,
    isAdmin, checklist, checklistFor, checklistFailed, retryChecklist: loadChecklist, addChecklistItem, renameChecklistItem, moveChecklistItem, deactivateChecklistItem, addItem, setItemStatus, addUpdate,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
