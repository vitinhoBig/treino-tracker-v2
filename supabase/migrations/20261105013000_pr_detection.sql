-- PR detection. Records are always rebuilt from an exercise's sets, so one algorithm handles finishing
-- a workout, retries, backdated logs and edits. Rules are documented in docs/DATA_MODEL.md.

-- Internal helpers. PostgREST only exposes the public schema, and nothing is granted to API roles here.
create schema private;
revoke all on schema private from public;

-- The sets that count toward records: finished workouts only, no warm-ups, at least one rep.
-- cmp_load is the load used for comparisons. Bodyweight lifts compare added load only, because
-- otherwise gaining body weight would turn the same pull-ups into a "PR".
create view private.counted_sets as
select
  s.id as set_id,
  s.workout_id,
  s.user_id,
  s.exercise_id,
  e.load_type,
  e.name as exercise_name,
  e.slug as exercise_slug,
  s.exercise_order,
  s.set_number,
  s.reps,
  s.load_kg,
  s.e1rm_kg,
  s.entered_load,
  s.entered_unit,
  s.is_per_side,
  w.local_date,
  w.started_at,
  case when e.load_type = 'bodyweight' then s.load_kg else s.effective_load_kg end as cmp_load
from public.workout_sets s
join public.workouts w on w.id = s.workout_id
join public.exercises e on e.id = s.exercise_id
where w.status = 'completed' and s.set_type <> 'warmup' and s.reps >= 1;

-- Smallest gain treated as real. 100 kg logged later as 220.5 lb is 100.017 kg, which is not a PR.
create function private.min_gain_kg() returns numeric
language sql immutable set search_path = '' as $$
  select 0.1::numeric;
$$;

create function private.rebuild_prs(p_user uuid, p_exercise uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_min_gain constant numeric := private.min_gain_kg();
  v_workout record;
  v_set record;
  v_best_e1rm numeric;
  v_best_load numeric;
  v_count integer := 0;
begin
  delete from public.personal_records where user_id = p_user and exercise_id = p_exercise;

  -- Walk the history in order. Each workout is compared only with workouts before it, so the first
  -- log sets the baseline and two sets in one session can't be each other's PR.
  for v_workout in
    select distinct workout_id, local_date, started_at
    from private.counted_sets
    where user_id = p_user and exercise_id = p_exercise
    order by local_date, started_at, workout_id
  loop
    -- e1RM. Skipped for bodyweight lifts, whose e1RM moves with body weight.
    select c.set_id, c.e1rm_kg into v_set
    from private.counted_sets c
    where c.workout_id = v_workout.workout_id and c.exercise_id = p_exercise
      and c.e1rm_kg is not null and c.load_type <> 'bodyweight'
    order by c.e1rm_kg desc, c.exercise_order, c.set_number
    limit 1;
    if found then
      if v_best_e1rm is not null and v_set.e1rm_kg >= v_best_e1rm + v_min_gain then
        insert into public.personal_records (user_id, exercise_id, set_id, workout_id, type, value, previous_value, local_date)
        values (p_user, p_exercise, v_set.set_id, v_workout.workout_id, 'e1rm', v_set.e1rm_kg, v_best_e1rm, v_workout.local_date);
        v_count := v_count + 1;
      end if;
      v_best_e1rm := greatest(v_best_e1rm, v_set.e1rm_kg);
    end if;

    -- Heaviest load, at any rep count.
    select c.set_id, c.cmp_load into v_set
    from private.counted_sets c
    where c.workout_id = v_workout.workout_id and c.exercise_id = p_exercise
    order by c.cmp_load desc, c.reps desc, c.exercise_order, c.set_number
    limit 1;
    if v_best_load is not null and v_set.cmp_load >= v_best_load + v_min_gain then
      insert into public.personal_records (user_id, exercise_id, set_id, workout_id, type, value, previous_value, local_date)
      values (p_user, p_exercise, v_set.set_id, v_workout.workout_id, 'load', v_set.cmp_load, v_best_load, v_workout.local_date);
      v_count := v_count + 1;
    end if;
    v_best_load := greatest(v_best_load, v_set.cmp_load);

    -- Rep PR: more reps than ever at this load or higher. With no earlier set that heavy there is
    -- nothing to beat, so that case is a load PR instead.
    select c.set_id, c.reps, prior.reps as prior_reps into v_set
    from private.counted_sets c
    cross join lateral (
      select max(h.reps) as reps
      from private.counted_sets h
      where h.user_id = p_user and h.exercise_id = p_exercise
        and (h.local_date, h.started_at, h.workout_id) < (v_workout.local_date, v_workout.started_at, v_workout.workout_id)
        and h.cmp_load >= c.cmp_load - v_min_gain
    ) prior
    where c.workout_id = v_workout.workout_id and c.exercise_id = p_exercise and c.reps > prior.reps
    order by c.cmp_load desc, c.reps desc, c.exercise_order, c.set_number
    limit 1;
    if found then
      insert into public.personal_records (user_id, exercise_id, set_id, workout_id, type, value, previous_value, local_date)
      values (p_user, p_exercise, v_set.set_id, v_workout.workout_id, 'reps_at_load', v_set.reps, v_set.prior_reps, v_workout.local_date);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;
