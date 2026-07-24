-- Mission Cards table for Kanban board
create table if not exists public.mission_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'inbox'
    check (status in ('inbox','up_next','in_progress','in_review','done','blocked')),
  position integer not null default 0,
  agent_id uuid references public.agents(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast column queries
create index if not exists mission_cards_workspace_status_idx
  on public.mission_cards (workspace_id, status, position);

-- Row-level security
alter table public.mission_cards enable row level security;

drop policy if exists "workspace members can select cards" on public.mission_cards;
create policy "workspace members can select cards"
  on public.mission_cards for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "workspace members can insert cards" on public.mission_cards;
create policy "workspace members can insert cards"
  on public.mission_cards for insert
  with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "workspace members can update cards" on public.mission_cards;
create policy "workspace members can update cards"
  on public.mission_cards for update
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "workspace members can delete cards" on public.mission_cards;
create policy "workspace members can delete cards"
  on public.mission_cards for delete
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function public.touch_mission_cards_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mission_cards_updated_at on public.mission_cards;
create trigger mission_cards_updated_at
  before update on public.mission_cards
  for each row execute function public.touch_mission_cards_updated_at();
