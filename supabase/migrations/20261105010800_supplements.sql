-- Supplements, dose logs and experiments.
-- Designed in docs/DATA_MODEL.md.

create table public.supplements (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.profiles (id) on delete cascade,
  name        text not null,
  default_dose numeric(7, 2),
  dose_unit   text not null default 'g',
  unique nulls not distinct (owner_id, name)
);

create index supplements_owner_idx on public.supplements (owner_id) where owner_id is not null;

create table public.supplement_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  supplement_id  uuid not null references public.supplements (id) on delete cascade,
  taken_on       date not null,
  dose           numeric(7, 2) not null check (dose >= 0),
  dose_unit      text not null default 'g',
  unique (user_id, supplement_id, taken_on)
);

create index supplement_logs_supplement_idx on public.supplement_logs (supplement_id);

create table public.experiments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  supplement_id       uuid not null references public.supplements (id) deferrable initially deferred,
  dose                numeric(7, 2) not null check (dose > 0),
  dose_unit           text not null default 'g',
  baseline_start      date not null,
  baseline_end        date not null,
  start_date          date not null,
  end_date            date,
  metrics             text[] not null
    check (metrics <@ array['anchor_e1rm', 'volume', 'body_weight']
           and cardinality(metrics) > 0),
  anchor_exercise_id  uuid references public.exercises (id) deferrable initially deferred,
  status              public.experiment_status not null default 'planned',
  result              jsonb,
  created_at          timestamptz not null default now(),
  check (baseline_start < baseline_end),
  check (baseline_end < start_date),
  check (end_date is null or end_date > start_date),
  check (not (metrics @> array['anchor_e1rm']) or anchor_exercise_id is not null)
);

create index experiments_user_idx on public.experiments (user_id, start_date desc);

create index experiments_supplement_idx on public.experiments (supplement_id);

create index experiments_anchor_idx on public.experiments (anchor_exercise_id)
  where anchor_exercise_id is not null;

alter table public.supplements enable row level security;

alter table public.supplement_logs enable row level security;

alter table public.experiments enable row level security;

create policy supplement_logs_owner on public.supplement_logs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.supplements s
    where s.id = supplement_id and (s.owner_id is null or s.owner_id = (select auth.uid()))));

create policy supplement_logs_viewer on public.supplement_logs for select to authenticated
  using (public.can_view(user_id, 'everything'));

create policy experiments_owner on public.experiments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.supplements s
                where s.id = supplement_id and (s.owner_id is null or s.owner_id = (select auth.uid())))
    and (anchor_exercise_id is null or exists (
      select 1 from public.exercises e
      where e.id = anchor_exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid())))));

create policy experiments_viewer on public.experiments for select to authenticated
  using (public.can_view(user_id, 'everything'));

create policy supplements_select on public.supplements for select to authenticated
  using (owner_id is null or public.can_view(owner_id, 'everything'));

create policy supplements_write on public.supplements for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
