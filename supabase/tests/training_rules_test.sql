-- The training math in generated columns, plus constraints that keep logged data consistent.
begin;
\ir helpers/fixtures.psql

select plan(15);

insert into public.workouts (id, user_id, local_date, started_at) values ('b0000000-0000-4000-8000-0000000000b1', tests.uid('stranger'), '2026-11-01', now());

create function tests.add_set(p_n int, p_reps int, p_load numeric, p_type public.set_type default 'working', p_per_side boolean default false, p_bw numeric default null)
returns public.workout_sets language sql as $$
  insert into public.workout_sets (id, workout_id, user_id, exercise_id, exercise_order, set_number, reps, load_kg, set_type, is_per_side, bodyweight_kg)
  values (gen_random_uuid(), 'b0000000-0000-4000-8000-0000000000b1', tests.uid('stranger'), 'e0000000-0000-4000-8000-000000000001', 0, p_n, p_reps, p_load, p_type, p_per_side, p_bw)
  returning *;
$$;

select is((tests.add_set(1, 10, 100)).e1rm_kg, 133.333, 'Epley: 100 kg x 10 = 133.333');
select is((tests.add_set(2, 1, 100)).e1rm_kg, 100.000, 'a single rep is its own e1RM');
select is((tests.add_set(3, 12, 100)).e1rm_kg, 140.000, '12 reps is the last estimated rep count');
select is((tests.add_set(4, 13, 100)).e1rm_kg, null, 'above 12 reps has no e1RM');
select is((tests.add_set(5, 5, 100, 'warmup')).e1rm_kg, null, 'warm-ups have no e1RM');
select is((tests.add_set(6, 0, 100)).e1rm_kg, null, 'zero reps has no e1RM');
select is((tests.add_set(7, 10, 0)).e1rm_kg, null, 'zero load has no e1RM');
select is((tests.add_set(8, 10, 50, 'working', true)).volume_kg, 1000.000, 'per-side volume counts both sides');
select is((tests.add_set(9, 10, 50, 'working', true)).e1rm_kg, 66.667, 'per-side e1RM stays per side');
select is((tests.add_set(10, 10, 0, 'working', false, 72.5)).volume_kg, 725.000, 'bodyweight counts toward volume');
select is((tests.add_set(11, 10, 10, 'working', false, 72.5)).effective_load_kg, 82.500, 'added load stacks on body weight');

-- A set can't claim to belong to one user while attached to another user's workout.
select tests.as_user('stranger');
select throws_ok(
  $$insert into public.workout_sets (id, workout_id, user_id, exercise_id, exercise_order, set_number, reps)
    values (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000001', auth.uid(), 'e0000000-0000-4000-8000-000000000001', 9, 1, 5)$$,
  '23503', null, 'a set cannot attach to another user''s workout');
select tests.as_admin();

select throws_ok($$select tests.add_set(1, 5, 100)$$, '23505', null, 'set numbers are unique within an exercise');
select throws_ok(
  $$insert into public.experiments (user_id, supplement_id, dose, baseline_start, baseline_end, start_date, metrics)
    values (tests.uid('owner'), 'f0000000-0000-4000-8000-000000000001', 5, '2026-09-01', '2026-10-15', '2026-10-01', array['volume'])$$,
  '23514', null, 'an experiment baseline must end before the experiment starts');

select is ((tests.add_set(12, 2, 100)).e1rm_kg, 106.667, 'Epley: 100 kg x 2 = 106.667'); 

select * from finish();
rollback;
