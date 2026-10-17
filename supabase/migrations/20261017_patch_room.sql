/* Handovers: atomic room writes and a history of draft changes. Not applied by the app repo: the lead applies it. */

/* 1. One room's part merged into handover_drafts.rooms in a single statement, so two phones saving different rooms */
/*    (or the same room's checklist and its submit) can no longer overwrite each other the way read, merge, write did. */
/*    Security invoker: the table's RLS still decides who may update. Returns the new rooms, or null if no draft row. */
create or replace function public.handover_patch_room(p_date date, p_room text, p_part jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update public.handover_drafts
     set rooms = jsonb_set(
           coalesce(rooms, '{}'::jsonb),
           array[p_room],
           coalesce(rooms -> p_room, '{}'::jsonb) || p_part,
           true)
   where service_date = p_date
  returning rooms;
$$;

revoke all on function public.handover_patch_room(date, text, jsonb) from public;
revoke all on function public.handover_patch_room(date, text, jsonb) from anon;
grant execute on function public.handover_patch_room(date, text, jsonb) to authenticated;

/* 2. History: the previous rooms and shared of a draft, kept every time either changes. */
create table if not exists public.handover_draft_history (
  id           bigserial primary key,
  service_date date not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid default auth.uid(),
  rooms        jsonb,
  shared       jsonb
);

create index if not exists handover_draft_history_date on public.handover_draft_history (service_date, changed_at desc);

alter table public.handover_draft_history enable row level security;
grant select on public.handover_draft_history to authenticated;

drop policy if exists "handover_draft_history select" on public.handover_draft_history;
create policy "handover_draft_history select" on public.handover_draft_history
  for select to authenticated using (public.has_handovers_access());

/* The trigger writes as its owner, because people may read the history but never write it. */
create or replace function public.handover_drafts_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.handover_draft_history (service_date, rooms, shared)
  values (old.service_date, old.rooms, old.shared);
  return new;
end;
$$;

drop trigger if exists handover_drafts_keep_history on public.handover_drafts;
create trigger handover_drafts_keep_history
  after update on public.handover_drafts
  for each row
  when (old.rooms is distinct from new.rooms or old.shared is distinct from new.shared)
  execute function public.handover_drafts_keep_history();
