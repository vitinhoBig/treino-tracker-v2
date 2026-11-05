-- Chooses the feed's "best lift" by improvement against the user's own history, so squats don't always
-- win. The first tier with a candidate wins, and candidates within a tier compare by percentage gain.
-- Tiers are documented in docs/DATA_MODEL.md.

-- How far back "recent best" looks, in days.
create function private.recent_best_days() returns integer
language sql immutable set search_path = '' as $$
  select 56;
$$;

-- This payload is visible at the `workouts` scope, so it must never reveal body weight. For bodyweight
-- lifts it carries added load and reps only: no effective load, e1RM or anything derived from them.
create function private.best_lift(p_workout uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_min_gain constant numeric := private.min_gain_kg();
  v_recent_days constant integer := private.recent_best_days();
  v_workout public.workouts;
  v_tier text;
  v_set_id uuid;
  v_prior_set_id uuid;
  v_gain numeric;
  v_previous numeric;
  v_ratio numeric;
  v_set private.counted_sets;
  v_prior private.counted_sets;
  v_delta numeric;
  v_basis text;
begin
  select * into v_workout from public.workouts where id = p_workout;

  -- Tier 1: an all-time PR. Bodyweight lifts have no e1RM PR, so their added-load PR stands in.
  select r.set_id, r.previous_value,
         case when r.previous_value > 0 then (r.value - r.previous_value) / r.previous_value else 1 end
    into v_set_id, v_previous, v_gain
  from public.personal_records r
  join public.exercises e on e.id = r.exercise_id
  join public.workout_sets s on s.id = r.set_id
  where r.workout_id = p_workout
    and (r.type = 'e1rm' or (r.type = 'load' and e.load_type = 'bodyweight'))
  order by 3 desc, s.exercise_order, s.set_number
  limit 1;
  if found then
    v_tier := 'pr';
  end if;

  -- Tier 2: a rep PR.
  if v_tier is null then
    select r.set_id, r.previous_value, (r.value - r.previous_value) / r.previous_value
      into v_set_id, v_previous, v_gain
    from public.personal_records r
    join public.workout_sets s on s.id = r.set_id
    where r.workout_id = p_workout and r.type = 'reps_at_load'
    order by 3 desc, s.exercise_order, s.set_number
    limit 1;
    if found then
      v_tier := 'rep_pr';
    end if;
  end if;

  -- Tier 3: beats the best of the recent window, though not the all-time best. Needs e1RM, so it
  -- doesn't apply to bodyweight lifts.
  if v_tier is null then
    select b.set_id, recent.set_id, recent.e1rm_kg, (b.e1rm_kg - recent.e1rm_kg) / recent.e1rm_kg
      into v_set_id, v_prior_set_id, v_previous, v_gain
    from (
      select distinct on (c.exercise_id) c.*
      from private.counted_sets c
      where c.workout_id = p_workout and c.e1rm_kg is not null and c.load_type <> 'bodyweight'
      order by c.exercise_id, c.e1rm_kg desc, c.exercise_order, c.set_number
    ) b
    cross join lateral (
      select h.set_id, h.e1rm_kg
      from private.counted_sets h
      where h.user_id = b.user_id and h.exercise_id = b.exercise_id and h.e1rm_kg is not null
        and (h.local_date, h.started_at, h.workout_id) < (v_workout.local_date, v_workout.started_at, v_workout.id)
        and h.local_date >= v_workout.local_date - v_recent_days
      order by h.e1rm_kg desc, h.local_date desc
      limit 1
    ) recent
    where b.e1rm_kg >= recent.e1rm_kg + v_min_gain
    order by 4 desc, b.exercise_order, b.set_number
    limit 1;
    if found then
      v_tier := 'recent_best';
    end if;
  end if;

  -- Tier 4: the set closest to its all-time best. A first-ever log has nothing to compare with.
  if v_tier is null then
    select b.set_id, b.e1rm_kg / best.e1rm_kg
      into v_set_id, v_ratio
    from (
      select distinct on (c.exercise_id) c.*
      from private.counted_sets c
      where c.workout_id = p_workout and c.e1rm_kg is not null and c.load_type <> 'bodyweight'
      order by c.exercise_id, c.e1rm_kg desc, c.exercise_order, c.set_number
    ) b
    cross join lateral (
      select max(h.e1rm_kg) as e1rm_kg
      from private.counted_sets h
      where h.user_id = b.user_id and h.exercise_id = b.exercise_id
        and (h.local_date, h.started_at, h.workout_id) < (v_workout.local_date, v_workout.started_at, v_workout.id)
    ) best
    where best.e1rm_kg is not null
    order by 2 desc, b.exercise_order, b.set_number
    limit 1;
    if found then
      v_tier := 'near_best';
    end if;
  end if;

  if v_tier is null then
    return null;
  end if;

  select * into v_set from private.counted_sets where set_id = v_set_id;

  if v_tier = 'rep_pr' then
    v_delta := v_set.reps - v_previous;
    v_basis := 'reps';
  elsif v_tier = 'pr' and v_set.load_type = 'bodyweight' then
    v_delta := v_set.load_kg - v_previous;
    v_basis := 'load';
  elsif v_tier in ('pr', 'recent_best') then
    if v_tier = 'pr' then
      -- The set that held the record just before this one.
      select h.set_id into v_prior_set_id
      from private.counted_sets h
      where h.user_id = v_set.user_id and h.exercise_id = v_set.exercise_id and h.e1rm_kg = v_previous
        and (h.local_date, h.started_at, h.workout_id) < (v_workout.local_date, v_workout.started_at, v_workout.id)
      order by h.local_date desc, h.started_at desc
      limit 1;
    end if;
    select * into v_prior from private.counted_sets where set_id = v_prior_set_id;
    -- "+5 lb" only makes sense when the reps match. Otherwise the fair comparison is estimated strength.
    if v_prior.reps = v_set.reps then
      v_delta := v_set.cmp_load - v_prior.cmp_load;
      v_basis := 'load';
    else
      v_delta := v_set.e1rm_kg - v_previous;
      v_basis := 'e1rm';
    end if;
  end if;

  return jsonb_build_object(
    'tier', v_tier,
    'exercise_id', v_set.exercise_id,
    'exercise_slug', v_set.exercise_slug,
    'exercise_name', v_set.exercise_name,
    'set_id', v_set.set_id,
    'reps', v_set.reps,
    'load_kg', v_set.load_kg,
    'entered_load', v_set.entered_load,
    'entered_unit', v_set.entered_unit,
    'is_per_side', v_set.is_per_side,
    'is_bodyweight', v_set.load_type = 'bodyweight',
    'delta', round(v_delta, 3),
    'delta_basis', v_basis,
    'gain_pct', round(v_gain * 100, 1),
    'pct_of_best', round(v_ratio * 100)
  );
end $$;
