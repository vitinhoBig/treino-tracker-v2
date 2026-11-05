-- Body metrics and wellness are separate tables because their sharing tiers differ.
-- Designed in docs/DATA_MODEL.md.

create table public.body_metrics (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  measured_on   date not null,
  weight_kg     numeric(6, 3) not null check (weight_kg between 20 and 500),
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 1 and 75),
  entered_weight numeric(6, 2),
  entered_unit  public.load_unit,
  source        text not null default 'app' check (source in ('app', 'v1_import')),
  created_at    timestamptz not null default now(),
  unique (user_id, measured_on)
);

create table public.daily_wellness (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  local_date   date not null,
  sleep_hours  numeric(3, 1) check (sleep_hours between 0 and 24),
  water_liters numeric(4, 2) check (water_liters >= 0),
  created_at   timestamptz not null default now(),
  primary key (user_id, local_date)
);

-- Kept exactly as v1 reported it, including nulls. Never recomputed.
create table public.v1_weekly_aggregates (
  user_id              uuid not null references public.profiles (id) on delete cascade,
  week                 smallint not null,
  total_sets           integer,
  total_volume_lb      numeric(10, 2),
  avg_sleep_hours      numeric(4, 2),
  avg_water_liters     numeric(4, 2),
  avg_rpe              numeric(3, 1),
  avg_calories         numeric(6, 1),
  avg_protein_g        numeric(5, 1),
  avg_body_weight_lbs  numeric(5, 1),
  avg_creatine_g       numeric(4, 1),
  primary key (user_id, week)
);

alter table public.body_metrics enable row level security;

alter table public.daily_wellness enable row level security;

alter table public.v1_weekly_aggregates enable row level security;

create policy v1_weekly_aggregates_select on public.v1_weekly_aggregates for select to authenticated
  using (user_id = (select auth.uid()));

-- Body metrics: needs at least workouts_and_body.
create policy body_metrics_owner on public.body_metrics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy body_metrics_viewer on public.body_metrics for select to authenticated
  using (public.can_view(user_id, 'workouts_and_body'));

-- The "everything" tier.
create policy daily_wellness_owner on public.daily_wellness for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy daily_wellness_viewer on public.daily_wellness for select to authenticated
  using (public.can_view(user_id, 'everything'));
