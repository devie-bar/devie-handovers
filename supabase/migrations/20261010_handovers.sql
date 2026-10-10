/* De Vie Handovers (handovers.devie.bar). Not applied by the app repo: the lead applies it. */
/* Three tables in public, all gated to anyone with a row in public.profiles */
/* (profiles.id = auth.users.id, as in the dashboard). Realtime on the two live ones. */

/* Access helper. Security definer so the check does not depend on profiles' own RLS. */
create or replace function public.has_handovers_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;
revoke all on function public.has_handovers_access() from public;
grant execute on function public.has_handovers_access() to authenticated;

/* One row per service date while the night is being written. */
create table if not exists public.handover_drafts (
  service_date  date primary key,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  /* keys summer / spring / autumn, each {by, covers, notes, closed, closedByHand, submittedAt} */
  rooms         jsonb not null default '{}'::jsonb,
  /* {vips, low, out, notes, todo, haiku} */
  shared        jsonb not null default '{}'::jsonb,
  /* SevenRooms: {source, asOf, messageId, all:{reservations, covers, walkIns, cancelled, noShows}, rooms:{summer:{reservations, covers}, autumn:{...}}} */
  booked        jsonb,
  /* Square night summary, as returned by /api/square/night */
  square        jsonb,
  published_by  text,
  published_at  timestamptz,
  slack_ts      text,
  slack_channel text,
  updated_at    timestamptz not null default now()
);

create or replace function public.handover_drafts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists handover_drafts_touch on public.handover_drafts;
create trigger handover_drafts_touch
  before update on public.handover_drafts
  for each row execute function public.handover_drafts_touch();

/* The log: one published row per night. */
create table if not exists public.handovers (
  service_date     date primary key,
  author           text,
  posted_at        timestamptz,
  total_covers     int,
  rooms            jsonb,
  vips             text,
  low              text[],
  "out"            text[],
  notes            text,
  todo             text,
  haiku            text,
  open_maintenance text[],
  square           jsonb,
  booked           jsonb
);

/* The maintenance list. */
create table if not exists public.maintenance_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  location    text,
  reported_by text,
  reported_on date not null default current_date,
  status      text not null default 'open' check (status in ('open', 'progress', 'done')),
  /* [{on, by, text}] */
  updates     jsonb not null default '[]'::jsonb,
  done_on     date,
  done_by     text,
  created_at  timestamptz default now()
);

/* Row level security: signed-in users with a profile row, all four verbs. */
alter table public.handover_drafts   enable row level security;
alter table public.handovers         enable row level security;
alter table public.maintenance_items enable row level security;

grant select, insert, update, delete on public.handover_drafts   to authenticated;
grant select, insert, update, delete on public.handovers         to authenticated;
grant select, insert, update, delete on public.maintenance_items to authenticated;

do $$
declare t text;
begin
  foreach t in array array['handover_drafts', 'handovers', 'maintenance_items'] loop
    execute format('drop policy if exists %I on public.%I', t || ' select', t);
    execute format('drop policy if exists %I on public.%I', t || ' insert', t);
    execute format('drop policy if exists %I on public.%I', t || ' update', t);
    execute format('drop policy if exists %I on public.%I', t || ' delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_handovers_access())', t || ' select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_handovers_access())', t || ' insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_handovers_access()) with check (public.has_handovers_access())', t || ' update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_handovers_access())', t || ' delete', t);
  end loop;
end
$$;

/* Realtime: several phones watch the same draft and the same list. */
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'handover_drafts') then
    alter publication supabase_realtime add table public.handover_drafts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maintenance_items') then
    alter publication supabase_realtime add table public.maintenance_items;
  end if;
end
$$;
