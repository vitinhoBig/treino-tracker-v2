-- Workouts, per-set logs and personal records. e1RM and volume are generated columns.
-- Designed in docs/DATA_MODEL.md.

create table public.workouts (
  id                  uuid primary key,  -- client-generated
  user_id             uuid not null references public.profiles (id) on delete cascade,
  type                public.workout_type not null default 'strength',
  sport_id            text references public.sports (id),
  name                text,
  status              public.workout_status not null default 'in_progress',
  local_date          date not null,
  started_at          timestamptz not null,
  ended_at            timestamptz,
  session_rpe         numeric(3, 1) check (session_rpe between 1 and 10),
  planned_session_id  uuid references public.planned_sessions (id) on delete set null,
  notes               text,
  source              text not null default 'app' check (source in ('app', 'v1_import')),
  source_ref          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  check (ended_at is null or ended_at >= started_at),
  check ((type = 'sport') = (sport_id is not null))
);

create index workouts_user_date_idx on public.workouts (user_id, local_date desc);

create index workouts_sport_idx on public.workouts (sport_id) where sport_id is not null;

create index workouts_planned_idx on public.workouts (planned_session_id)
  where planned_session_id is not null;

create unique index workouts_source_ref_uq on public.workouts (user_id, source, source_ref)
  where source_ref is not null;

create table public.workout_sets (
  id              uuid primary key,  -- client-generated
  workout_id      uuid not null,
  user_id         uuid not null,
  exercise_id     uuid not null references public.exercises (id) deferrable initially deferred,
  exercise_order  smallint not null check (exercise_order >= 0),
  set_number      smallint not null check (set_number >= 1),
  set_type        public.set_type not null default 'working',
  reps            smallint not null check (reps between 0 and 200),
  load_kg         numeric(7, 3) not null default 0 check (load_kg >= 0),
  bodyweight_kg   numeric(6, 3) check (bodyweight_kg > 0),
  entered_load    numeric(7, 2),
  entered_unit    public.load_unit,
  is_per_side     boolean not null default false,
  rpe             numeric(3, 1) check (rpe between 1 and 10),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  effective_load_kg numeric(8, 3) generated always as
    (load_kg + coalesce(bodyweight_kg, 0)) stored,
  volume_kg numeric(10, 3) generated always as
    (reps * (load_kg + coalesce(bodyweight_kg, 0)) * case when is_per_side then 2 else 1 end) stored,
  e1rm_kg numeric(8, 3) generated always as (
    case
      when set_type = 'warmup' or (load_kg + coalesce(bodyweight_kg, 0)) <= 0 then null
      when reps = 1 then load_kg + coalesce(bodyweight_kg, 0)
      when reps between 2 and 12
        then round((load_kg + coalesce(bodyweight_kg, 0)) * (1 + reps / 30.0), 3)
      else null
    end
  ) stored,

  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade,
  unique (workout_id, exercise_order, set_number),
  check ((entered_load is null) = (entered_unit is null))
);

create index workout_sets_user_exercise_idx
  on public.workout_sets (user_id, exercise_id, e1rm_kg desc nulls last);

create index workout_sets_exercise_idx on public.workout_sets (exercise_id);

create table public.personal_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  exercise_id     uuid not null references public.exercises (id) deferrable initially deferred,
  set_id          uuid not null references public.workout_sets (id) on delete cascade,
  workout_id      uuid not null references public.workouts (id) on delete cascade,
  type            public.pr_type not null,
  value           numeric(10, 3) not null,
  previous_value  numeric(10, 3),
  local_date      date not null,
  created_at      timestamptz not null default now(),
  unique (set_id, type)
);

create index personal_records_user_exercise_idx
  on public.personal_records (user_id, exercise_id, type, local_date desc);

create index personal_records_workout_idx on public.personal_records (workout_id);

create index personal_records_exercise_idx on public.personal_records (exercise_id);

create trigger workouts_updated before update on public.workouts
  for each row execute function public.set_updated_at();

create trigger workout_sets_updated before update on public.workout_sets
  for each row execute function public.set_updated_at();

alter table public.workouts enable row level security;

alter table public.workout_sets enable row level security;

alter table public.personal_records enable row level security;

-- Workouts: viewers never see a session that is still in progress.
create policy workouts_owner on public.workouts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy workouts_viewer on public.workouts for select to authenticated
  using (status = 'completed' and public.can_view(user_id, 'workouts'));

create policy workout_sets_owner on public.workout_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.exercises e
    where e.id = exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid()))));

create policy workout_sets_viewer on public.workout_sets for select to authenticated
  using (public.can_view(user_id, 'workouts') and exists (
    select 1 from public.workouts w where w.id = workout_id and w.status = 'completed'));

-- Personal records: read-only for clients. Written by finish_workout.
create policy personal_records_select on public.personal_records for select to authenticated
  using (public.can_view(user_id, 'workouts'));
