export const ROOMS = ["Summer", "Spring", "Autumn"] as const;
export type RoomKey = "summer" | "spring" | "autumn";
export const ROOM_KEYS: RoomKey[] = ["summer", "spring", "autumn"];
// The kitchen and prep report like a room (who, notes, when) but is not one: it has no covers, no closed state, and is
// kept out of ROOM_KEYS so totals, booked covers and the Square room table never see it.
export type SectionKey = RoomKey | "kitchen" | "prep";

export interface RoomPart {
  by?: string;
  /** null (or absent) = nobody typed a figure: the room is reported as "not reported", never as 0. */
  covers?: number | null;
  notes?: string;
  closed?: boolean;
  closedByHand?: boolean;
  submittedAt?: string | null;
  /** 85 and 86 for this room's list: menu names joined ", " on the first line, free text lines after. */
  low?: string;
  out?: string;
  /** Ids of the checklist items ticked on this night. */
  checks?: string[];
}

export interface Shared {
  vips?: string;
  low?: string;
  out?: string;
  notes?: string;
  todo?: string;
  haiku?: string;
}

export interface Booked {
  source?: string;
  asOf?: string;
  messageId?: string;
  all?: { reservations?: number; covers?: number; walkIns?: number; cancelled?: number; noShows?: number };
  rooms?: Partial<Record<RoomKey, { reservations: number; covers: number }>>;
}

export interface SquareRoom { tables: number; orders: number; gross: number; tips: number }
export interface SquareSummary {
  pulledAt: string;
  totals: {
    orders: number; gross: number; discount: number; tax: number; tips: number; total: number;
    card: number; cash: number; otherTender: number; items: number; net: number; avg: number;
  };
  rooms: Record<RoomKey | "other", SquareRoom>;
  /** The service window the pull covered, ISO. Absent on pulls made before this was stored. */
  window?: { start: string; end: string };
  categories: { name: string; qty: number; gross: number; net?: number }[];
  top: { name: string; qty: number; gross: number }[];
}

/** One line of a section's nightly checklist (public.handover_checklists). */
/** detail is the muted second line, only set for items that come from the Tasks app. */
export interface ChecklistItem { id: string; section: SectionKey; label: string; sort: number; active: boolean; detail?: string | null }

export interface DraftRow {
  service_date: string;
  status: "draft" | "published";
  rooms: Partial<Record<SectionKey, RoomPart>>;
  shared: Shared;
  booked: Booked | null;
  square: SquareSummary | null;
  published_by: string | null;
  published_at: string | null;
  slack_ts: string | null;
  slack_channel: string | null;
  updated_at?: string;
}

export interface HandoverRoom { open?: boolean; covers?: number | null; notes?: string; by?: string; low?: string; out?: string; checks?: string[]; /** Labels of the active items left unticked when it was published. */ notDone?: string[] }

export interface HandoverRow {
  service_date: string;
  author: string | null;
  posted_at: string | null;
  total_covers: number | null;
  rooms: Partial<Record<SectionKey, HandoverRoom>> | null;
  vips: string | null;
  low: string[] | null;
  out: string[] | null;
  notes: string | null;
  todo: string | null;
  haiku: string | null;
  open_maintenance: string[] | null;
  square: SquareSummary | null;
  booked: Booked | null;
}

export type MaintenanceStatus = "open" | "progress" | "done";
export interface MaintenanceUpdate { on: string; by: string; text: string }
export interface MaintenanceItem {
  id: string;
  title: string;
  location: string | null;
  reported_by: string | null;
  reported_on: string;
  status: MaintenanceStatus;
  updates: MaintenanceUpdate[];
  done_on: string | null;
  done_by: string | null;
  created_at?: string;
}

export const PEOPLE = ["Barney", "Tom", "Cherry", "Alex", "Arron", "Sarah", "Julie", "Cassandre", "Other"];
export const LOCATIONS = ["Bar", "Summer", "Spring", "Autumn", "Winter", "Kitchen", "Prep", "Cave", "Toilets", "Front", "Other"];
export const CHANNEL_LABEL = { channel: "#handovers", test: "your Slack DMs" } as const;
