-- Records and feed payloads are visible at the workouts scope, so nothing they're built from may reveal
-- body weight. Anything with a body weight snapshot counts as a bodyweight set here, even if its exercise
-- is marked external, because exercise settings can change after sets are logged. entered_load is hidden
-- too: on these sets it could hold the body weight, as v1's pull-ups did.
create or replace view private.counted_sets as
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
  (case when s.bodyweight_kg is null then s.e1rm_kg end)::numeric(8, 3) as e1rm_kg,
  (case when e.load_type = 'external' and s.bodyweight_kg is null then s.entered_load end)::numeric(7, 2) as entered_load,
  case when e.load_type = 'external' and s.bodyweight_kg is null then s.entered_unit end as entered_unit,
  s.is_per_side,
  w.local_date,
  w.started_at,
  case when e.load_type = 'bodyweight' or s.bodyweight_kg is not null then s.load_kg else s.effective_load_kg end as cmp_load
from public.workout_sets s
join public.workouts w on w.id = s.workout_id
join public.exercises e on e.id = s.exercise_id
where w.status = 'completed' and s.set_type <> 'warmup' and s.reps >= 1;
