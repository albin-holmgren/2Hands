-- Memory Boxes: Cohere-inspired contextual containers for organizing memories
create table if not exists public.memory_boxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'knowledge'
    check (category in ('persona','projects','knowledge','operations','context')),
  icon text, -- emoji or icon identifier
  color text, -- hex color for UI
  is_pinned boolean not null default false,
  memory_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memory_boxes_user_workspace_idx
  on public.memory_boxes (user_id, workspace_id);

-- Add box_id to existing ai_manager_memories table
alter table public.ai_manager_memories
  add column if not exists box_id uuid references public.memory_boxes(id) on delete set null;

create index if not exists ai_manager_memories_box_idx
  on public.ai_manager_memories (box_id) where box_id is not null;

-- RLS for memory_boxes
alter table public.memory_boxes enable row level security;

drop policy if exists "users can select own boxes" on public.memory_boxes;
create policy "users can select own boxes"
  on public.memory_boxes for select
  using (user_id = auth.uid());

drop policy if exists "users can insert own boxes" on public.memory_boxes;
create policy "users can insert own boxes"
  on public.memory_boxes for insert
  with check (user_id = auth.uid());

drop policy if exists "users can update own boxes" on public.memory_boxes;
create policy "users can update own boxes"
  on public.memory_boxes for update
  using (user_id = auth.uid());

drop policy if exists "users can delete own boxes" on public.memory_boxes;
create policy "users can delete own boxes"
  on public.memory_boxes for delete
  using (user_id = auth.uid());

-- Auto-update updated_at
create or replace function public.touch_memory_boxes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists memory_boxes_updated_at on public.memory_boxes;
create trigger memory_boxes_updated_at
  before update on public.memory_boxes
  for each row execute function public.touch_memory_boxes_updated_at();

-- Function to update memory_count on memory assignment changes
create or replace function public.update_memory_box_count()
returns trigger language plpgsql as $$
begin
  -- Decrement old box count
  if OLD.box_id is not null then
    update public.memory_boxes set memory_count = greatest(0, memory_count - 1), updated_at = now()
    where id = OLD.box_id;
  end if;
  -- Increment new box count
  if NEW.box_id is not null then
    update public.memory_boxes set memory_count = memory_count + 1, updated_at = now()
    where id = NEW.box_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists ai_manager_memories_box_count on public.ai_manager_memories;
create trigger ai_manager_memories_box_count
  after update of box_id on public.ai_manager_memories
  for each row execute function public.update_memory_box_count();
