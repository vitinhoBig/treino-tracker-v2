-- Sports, availability and planned sessions. Schedules are owner-only at every sharing tier.
-- Designed in docs/DATA_MODEL.md.

create table public.sports (
  id    text primary key,
  name  text not null
);

create table public.user_sports (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  sport_id  text not null references public.sports (id),
  primary key (user_id, sport_id)
);

create index user_sports_sport_idx on public.user_sports (sport_id);

create table public.schedule_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  mode               public.schedule_mode not null,
  sessions_per_week  smallint check (sessions_per_week between 1 and 14),
  updated_at         timestamptz not null default now(),
  check (mode <> 'flexible' or sessions_per_week is not null)
);

create table public.availability_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);

create index availability_slots_user_idx on public.availability_slots (user_id, weekday);

create table public.planned_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  planned_date      date not null,
  label             text not null,
  focus             text[] not null default '{}',
  status            public.planned_status not null default 'planned',
  rescheduled_from  uuid references public.planned_sessions (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index planned_sessions_user_date_idx on public.planned_sessions (user_id, planned_date);

create index planned_sessions_rescheduled_idx on public.planned_sessions (rescheduled_from)
  where rescheduled_from is not null;

create trigger schedule_preferences_updated before update on public.schedule_preferences
  for each row execute function public.set_updated_at();

alter table public.sports enable row level security;

alter table public.user_sports enable row level security;

alter table public.schedule_preferences enable row level security;

alter table public.availability_slots enable row level security;

alter table public.planned_sessions enable row level security;

create policy user_sports_owner on public.user_sports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy schedule_preferences_owner on public.schedule_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy availability_slots_owner on public.availability_slots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy planned_sessions_owner on public.planned_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Read-only catalogs. Seeded by migrations.
create policy sports_read on public.sports for select to authenticated using (true);
