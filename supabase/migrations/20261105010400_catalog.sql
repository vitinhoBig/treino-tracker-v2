-- Muscle groups and exercises: a shared catalog plus each user's custom exercises.
-- Designed in docs/DATA_MODEL.md.

create table public.muscle_groups (
  id    text primary key,
  name  text not null
);

create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references public.profiles (id) on delete cascade,
  slug              text unique,
  name              text not null,
  equipment         text not null default 'other',
  pattern           public.movement_pattern not null default 'other',
  load_type         public.load_type not null default 'external',
  is_unilateral     boolean not null default false,
  created_at        timestamptz not null default now(),
  unique nulls not distinct (owner_id, name),
  check (owner_id is not null or slug is not null)
);

create index exercises_owner_idx on public.exercises (owner_id) where owner_id is not null;

create table public.exercise_muscles (
  exercise_id      uuid not null references public.exercises (id) on delete cascade,
  muscle_group_id  text not null references public.muscle_groups (id),
  role             public.muscle_role not null default 'primary',
  share            numeric(3, 2) not null default 1.0 check (share > 0 and share <= 1),
  primary key (exercise_id, muscle_group_id)
);

create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_group_id);

alter table public.muscle_groups enable row level security;

alter table public.exercises enable row level security;

alter table public.exercise_muscles enable row level security;

create policy muscle_groups_read on public.muscle_groups for select to authenticated using (true);

-- Exercises: catalog for everyone, custom for the owner and their workout viewers.
create policy exercises_select on public.exercises for select to authenticated
  using (owner_id is null or public.can_view(owner_id, 'workouts'));

create policy exercises_insert on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy exercises_update on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy exercises_delete on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy exercise_muscles_select on public.exercise_muscles for select to authenticated
  using (exists (select 1 from public.exercises e where e.id = exercise_id));

create policy exercise_muscles_write on public.exercise_muscles for all to authenticated
  using (exists (select 1 from public.exercises e
                 where e.id = exercise_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.exercises e
                      where e.id = exercise_id and e.owner_id = (select auth.uid())));
