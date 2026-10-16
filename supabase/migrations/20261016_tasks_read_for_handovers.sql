/* Handovers reads its nightly checklists from the Tasks app's closedown lists. Not applied by the app repo: the lead */
/* applies it, in step with the Tasks side. Additive only: no existing policy, column or row is changed. */

/* Which Handovers section a closedown list belongs to. Null for every other kind of list. */
alter table public.task_lists add column if not exists section text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_lists'::regclass and conname = 'task_lists_section_check'
  ) then
    alter table public.task_lists
      add constraint task_lists_section_check
      check (section is null or section in ('prep', 'summer', 'spring', 'autumn', 'kitchen'));
  end if;
end
$$;

/* Anyone with Handovers access may read the lists and items (writes stay with whatever policies Tasks already has). */
grant select on public.task_lists to authenticated;
grant select on public.task_items to authenticated;

drop policy if exists "task_lists read for handovers" on public.task_lists;
create policy "task_lists read for handovers" on public.task_lists
  for select to authenticated using (public.has_handovers_access());

drop policy if exists "task_items read for handovers" on public.task_items;
create policy "task_items read for handovers" on public.task_items
  for select to authenticated using (public.has_handovers_access());

/* Realtime: an edit in Tasks reaches open Handovers pages straight away. */
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_lists') then
    alter publication supabase_realtime add table public.task_lists;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_items') then
    alter publication supabase_realtime add table public.task_items;
  end if;
end
$$;
