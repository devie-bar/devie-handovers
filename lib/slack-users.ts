import { PEOPLE } from "@/lib/types";
import { SLACK_IDS } from "@/lib/slack-ids";

// Resolves people to Slack user ids from the workspace itself, so a new team member is tagged as soon as they join.
// Needs the bot scopes users:read and users:read.email. lib/slack-ids.ts stays as the fallback.

interface SlackUser {
  id: string;
  deleted?: boolean;
  is_bot?: boolean;
  real_name?: string;
  profile?: { real_name?: string; display_name?: string; email?: string };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const firstWord = (s?: string) => norm(String(s || "")).split(/\s+/)[0] || "";

async function listUsers(token: string): Promise<SlackUser[]> {
  const users: SlackUser[] = [];
  let cursor = "";
  do {
    const url = "https://slack.com/api/users.list?limit=200" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    const j = (await res.json()) as { ok: boolean; error?: string; members?: SlackUser[]; response_metadata?: { next_cursor?: string } };
    if (!j.ok) throw new Error(j.error || `Slack HTTP ${res.status}`);
    users.push(...(j.members || []));
    cursor = j.response_metadata?.next_cursor || "";
  } while (cursor);
  return users;
}

/** Match each name on the people list to a Slack user by first name, display name or email local part. */
export function matchPeople(users: SlackUser[], people: readonly string[]): Record<string, string> {
  const live = users.filter((u) => !u.deleted && !u.is_bot && u.id !== "USLACKBOT");
  const keysOf = (u: SlackUser) => {
    const email = u.profile?.email || "";
    return new Set([
      firstWord(u.real_name || u.profile?.real_name), firstWord(u.profile?.display_name), norm(email.split("@")[0] || ""),
    ].filter(Boolean));
  };
  const indexed = live.map((u) => ({ u, keys: keysOf(u) }));
  const out: Record<string, string> = {};
  for (const name of people) {
    if (name === "Other") continue;
    const k = norm(name);
    let hits = indexed.filter((x) => x.keys.has(k)).map((x) => x.u);
    if (hits.length > 1) hits = hits.filter((u) => (u.profile?.email || "").toLowerCase().endsWith("@devie.bar"));
    if (hits.length === 1) out[name] = hits[0].id;
  }
  return out;
}

let cache: { at: number; ids: Record<string, string> } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** The static map overlaid with the workspace lookup (dynamic wins). Never throws: on any failure the static map is used. */
export async function slackIds(token: string): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  try {
    const ids = { ...SLACK_IDS, ...matchPeople(await listUsers(token), PEOPLE) };
    cache = { at: Date.now(), ids };
    return ids;
  } catch (err) {
    console.error("Slack users.list failed, using the static map:", (err as Error).message);
    return SLACK_IDS;
  }
}
