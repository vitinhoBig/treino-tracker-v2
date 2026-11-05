-- Feed events. Clients can read them but never write them.
-- Designed in docs/DATA_MODEL.md.

create table public.feed_events (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid not null references public.profiles (id) on delete cascade,
  type            text not null check (type in ('trained_today')),
  workout_id      uuid references public.workouts (id) on delete cascade,
  required_scope  public.share_scope not null default 'workouts',
  payload         jsonb not null,
  local_date      date not null,
  created_at      timestamptz not null default now(),
  unique (workout_id, type)
);

create index feed_events_actor_idx on public.feed_events (actor_id, created_at desc);

alter table public.feed_events enable row level security;

-- Feed: read-only for clients. Written by finish_workout.
create policy feed_events_select on public.feed_events for select to authenticated
  using (public.can_view(actor_id, required_scope));
