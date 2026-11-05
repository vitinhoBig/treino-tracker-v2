-- How viewers read someone's sets. RLS can hide rows but not columns, so a viewer without body access
-- gets bodyweight sets with everything that reveals body weight set to null. Reps and added load stay.
-- body_masked lets the app tell "hidden from you" apart from "never recorded".
-- Sharing no access returns no rows, not an error, so this can't be used to probe who shares with whom.
create function public.get_shared_sets(
  p_owner uuid,
  p_workout_id uuid default null,
  p_from date default null,
  p_to date default null
)
returns table (
  id uuid,
  workout_id uuid,
  user_id uuid,
  exercise_id uuid,
  local_date date,
  exercise_order smallint,
  set_number smallint,
  set_type public.set_type,
  reps smallint,
  load_kg numeric,
  is_per_side boolean,
  rpe numeric,
  completed_at timestamptz,
  body_masked boolean,
  bodyweight_kg numeric,
  effective_load_kg numeric,
  volume_kg numeric,
  e1rm_kg numeric,
  entered_load numeric,
  entered_unit public.load_unit
)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select public.can_view(p_owner, 'workouts') as can_read,
           public.can_view(p_owner, 'workouts_and_body') as can_see_body
  )
  select
    s.id, s.workout_id, s.user_id, s.exercise_id, w.local_date, s.exercise_order, s.set_number,
    s.set_type, s.reps, s.load_kg, s.is_per_side, s.rpe, s.completed_at,
    m.masked,
    case when m.masked then null else s.bodyweight_kg end,
    case when m.masked then null else s.effective_load_kg end,
    case when m.masked then null else s.volume_kg end,
    case when m.masked then null else s.e1rm_kg end,
    case when m.masked then null else s.entered_load end,
    case when m.masked then null else s.entered_unit end
  from public.workout_sets s
  join public.workouts w on w.id = s.workout_id
  join public.exercises e on e.id = s.exercise_id
  cross join access a
  cross join lateral (
    select (e.load_type = 'bodyweight' or s.bodyweight_kg is not null) and not a.can_see_body as masked
  ) m
  where a.can_read
    and s.user_id = p_owner
    and w.status = 'completed'
    and (p_workout_id is null or s.workout_id = p_workout_id)
    and (p_from is null or w.local_date >= p_from)
    and (p_to is null or w.local_date <= p_to)
  order by w.local_date, w.started_at, s.exercise_order, s.set_number;
$$;

revoke all on function public.get_shared_sets(uuid, uuid, date, date) from public, anon;
grant execute on function public.get_shared_sets(uuid, uuid, date, date) to authenticated;
