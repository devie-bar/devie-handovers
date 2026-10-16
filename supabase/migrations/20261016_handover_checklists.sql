/* Nightly checklists for Handovers (handovers.devie.bar). Not applied by the app repo: the lead applies it. */
/* One list of items per section (prep, summer, spring, autumn, kitchen). Which items were ticked on a given night */
/* lives in handover_drafts.rooms.<section>.checks as an array of item ids, so every night starts unticked. */
/* Admin means public.profiles.role = 'admin', through the existing public.is_admin() helper shared with the Library */
/* and the Dashboard. Nothing is added to profiles. */

create table if not exists public.handover_checklists (
  id         uuid primary key default gen_random_uuid(),
  section    text not null check (section in ('prep', 'summer', 'spring', 'autumn', 'kitchen')),
  label      text not null,
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists handover_checklists_section_sort on public.handover_checklists (section, sort);

alter table public.handover_checklists enable row level security;

grant select, insert, update, delete on public.handover_checklists to authenticated;

drop policy if exists "handover_checklists select" on public.handover_checklists;
drop policy if exists "handover_checklists insert" on public.handover_checklists;
drop policy if exists "handover_checklists update" on public.handover_checklists;
drop policy if exists "handover_checklists delete" on public.handover_checklists;

/* Everyone with Handovers access reads; only admins write. */
create policy "handover_checklists select" on public.handover_checklists
  for select to authenticated using (public.has_handovers_access());
create policy "handover_checklists insert" on public.handover_checklists
  for insert to authenticated with check (public.is_admin());
create policy "handover_checklists update" on public.handover_checklists
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "handover_checklists delete" on public.handover_checklists
  for delete to authenticated using (public.is_admin());

/* Realtime: other open pages see item changes straight away. */
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'handover_checklists') then
    alter publication supabase_realtime add table public.handover_checklists;
  end if;
end
$$;

/* Three placeholders per section so the lists are visible before real items are written. Runs once, on an empty table. */
insert into public.handover_checklists (section, label, sort)
select s.section, 'Example item ' || n, n
from (values ('prep'), ('summer'), ('spring'), ('autumn'), ('kitchen')) as s(section)
cross join generate_series(1, 3) as n
where not exists (select 1 from public.handover_checklists);
