// A realtime update only carries the columns Postgres sent. Large unchanged jsonb columns (rooms, shared, square)
// are stored out of line and are left out of the payload when a different column changes, e.g. when Square data
// is saved. Laying such a payload over the draft wholesale blanks every room, so merge it field by field instead.
export function mergeDraftPayload<T extends object>(prev: T, incoming: Partial<T>): T {
  const next = { ...prev } as Record<string, unknown>;
  for (const [k, v] of Object.entries(incoming)) if (v !== undefined) next[k] = v;
  return next as T;
}
