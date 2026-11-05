-- Which lift the feed highlights, and that its wording stays truthful.
begin;
\ir helpers/fixtures.psql
\ir helpers/training.psql

select plan(28);

create function tests.best(p_workout uuid) returns jsonb language sql as $$
  select private.best_lift(p_workout);
$$;

create temp table ex as select tests.exercise('squat') as squat, tests.exercise('bench') as bench,
  tests.exercise('curl') as curl, tests.exercise('press') as press, tests.exercise('row') as row_ex,
  tests.exercise('pullup', 'bodyweight') as pullup;

-- Percentage decides, so squats don't always win.
select tests.lift(w, squat, 10, 200), tests.lift(w, bench, 10, 50) from ex, tests.workout('owner', '2026-01-01') w;
create temp table w1 as select tests.workout('owner', '2026-01-08') as id;
select tests.lift(w1.id, squat, 10, 204), tests.lift(w1.id, bench, 10, 52.5) from ex, w1;
select tests.rebuild('owner', squat), tests.rebuild('owner', bench) from ex;
select is((tests.best(w1.id)) ->> 'tier', 'pr', 'an all-time PR is tier 1') from w1;
select is((tests.best(w1.id)) ->> 'exercise_slug', 'bench', 'the bigger percentage gain wins, not the bigger weight') from w1;
select is(((tests.best(w1.id)) ->> 'gain_pct')::numeric, 5.0, 'gain is 5% for 50 to 52.5 kg') from w1;
select is((tests.best(w1.id)) ->> 'delta_basis', 'load', 'with matching reps, the gain is shown as load') from w1;
select is(((tests.best(w1.id)) ->> 'delta')::numeric, 2.500, 'the load gain is 2.5 kg') from w1;

-- Different reps can't be read as "+N kg", so the gain is estimated strength.
create temp table w2 as select tests.workout('owner', '2026-01-15') as id;
select tests.lift(w2.id, bench, 8, 60) from ex, w2;
select tests.rebuild('owner', bench) from ex;
select is((tests.best(w2.id)) ->> 'delta_basis', 'e1rm', 'with different reps, the gain is shown as e1RM') from w2;
select is(((tests.best(w2.id)) ->> 'delta')::numeric, 6.000, 'the e1RM gain is 76 minus 70') from w2;

-- A PR outranks a rep PR, even when the rep PR is a bigger percentage.
select tests.lift(w, curl, 10, 40), tests.lift(w, press, 10, 40) from ex, tests.workout('owner', '2026-01-01') w;
create temp table w3 as select tests.workout('owner', '2026-01-08') as id;
select tests.lift(w3.id, curl, 15, 20), tests.lift(w3.id, press, 10, 41) from ex, w3;
select tests.lift(tests.workout('owner', '2025-12-01'), curl, 10, 45) from ex;
select tests.rebuild('owner', curl), tests.rebuild('owner', press) from ex;
select is((tests.best(w3.id)) ->> 'exercise_slug', 'press', 'tier 1 beats tier 2 regardless of percentage') from w3;

-- Rep PR.
create temp table w4 as select tests.workout('owner', '2026-01-22') as id;
select tests.lift(w4.id, curl, 11, 40) from ex, w4;
select tests.rebuild('owner', curl) from ex;
select is((tests.best(w4.id)) ->> 'tier', 'rep_pr', 'more reps than ever at this load is tier 2') from w4;
select is((tests.best(w4.id)) ->> 'delta_basis', 'reps', 'a rep PR reports extra reps') from w4;
select is(((tests.best(w4.id)) ->> 'delta')::numeric, 1::numeric, 'it did one more rep') from w4;

-- Vs recent best, using the real v1 pattern: 260 lb long ago, then a comeback through 225 to 230 lb.
select tests.lift(tests.workout('stranger', '2025-07-01'), squat, 10, 117.934) from ex;
select tests.lift(tests.workout('stranger', '2026-03-01'), squat, 10, 102.058) from ex;
create temp table w5 as select tests.workout('stranger', '2026-03-08') as id;
select tests.lift(w5.id, squat, 10, 104.326, 'working', null, 230, 'lb') from ex, w5;
select tests.rebuild('stranger', squat) from ex;
select is((tests.best(w5.id)) ->> 'tier', 'recent_best', 'beating the last 8 weeks is tier 3, not a PR') from w5;
select is(((tests.best(w5.id)) ->> 'delta')::numeric, 2.268, 'the gain over recent best is 5 lb, in kg') from w5;
select is((tests.best(w5.id)) ->> 'delta_basis', 'load', 'reps match, so it reads as +5 lb') from w5;
select is((tests.best(w5.id)) ->> 'entered_load', '230.00', 'the feed shows what the user typed') from w5;
select is((select count(*)::int from public.personal_records r, ex, w5 where r.workout_id = w5.id and r.exercise_id = ex.squat), 0, 'and no PR row exists for it') from w5;

-- The window edges. Day 56 is inside, and day 57 is outside.
select tests.lift(tests.workout('viewer_w', '2025-01-01'), squat, 10, 200) from ex;
select tests.lift(tests.workout('viewer_w', '2026-01-01'), squat, 10, 100) from ex;
create temp table w6 as select tests.workout('viewer_w', '2026-02-26') as id;
select tests.lift(w6.id, squat, 10, 105) from ex, w6;
select tests.rebuild('viewer_w', squat) from ex;
select is((tests.best(w6.id)) ->> 'tier', 'recent_best', 'a set exactly 56 days back counts as recent') from w6;

select tests.lift(tests.workout('viewer_b', '2025-01-01'), squat, 10, 200) from ex;
select tests.lift(tests.workout('viewer_b', '2026-01-01'), squat, 10, 100) from ex;
create temp table w7 as select tests.workout('viewer_b', '2026-02-27') as id;
select tests.lift(w7.id, squat, 10, 105) from ex, w7;
select tests.rebuild('viewer_b', squat) from ex;
select is((tests.best(w7.id)) ->> 'tier', 'near_best', 'a set 57 days back is too old to be recent') from w7;

-- Near best.
select is(((tests.best(w7.id)) ->> 'pct_of_best')::numeric, 52::numeric, 'it reports the percentage of the all-time best') from w7;

-- Equalling the recent best isn't an improvement.
select tests.lift(tests.workout('viewer_e', '2025-01-01'), squat, 10, 200) from ex;
select tests.lift(tests.workout('viewer_e', '2026-01-01'), squat, 10, 100) from ex;
create temp table w8 as select tests.workout('viewer_e', '2026-01-08') as id;
select tests.lift(w8.id, squat, 10, 100) from ex, w8;
select tests.rebuild('viewer_e', squat) from ex;
select is((tests.best(w8.id)) ->> 'tier', 'near_best', 'matching the recent best is not tier 3') from w8;

-- Nothing to compare.
create temp table w9 as select tests.workout('owner', '2026-01-01') as id;
select tests.lift(w9.id, row_ex, 10, 50) from ex, w9;
select tests.rebuild('owner', row_ex) from ex;
select is(tests.best(w9.id), null, 'a first-ever log has no best lift') from w9;

-- Body weight stays out of a payload that `workouts` viewers can read. Searching for the number alone
-- would miss derived values like e1RM, so the allowed keys and every numeric value are pinned.
create function tests.payload_numbers(p jsonb) returns numeric[] language sql as $$
  select array_agg((value #>> '{}')::numeric order by key) from jsonb_each(p)
  where jsonb_typeof(value) = 'number';
$$;
select tests.lift(tests.workout('owner', '2026-01-01'), pullup, 10, 0, 'working', 72.5) from ex;
create temp table w10 as select tests.workout('owner', '2026-01-08') as id;
select tests.lift(w10.id, pullup, 12, 0, 'working', 72.5) from ex, w10;
select tests.rebuild('owner', pullup) from ex;
select is((tests.best(w10.id)) ->> 'tier', 'rep_pr', 'a bodyweight rep PR is tier 2') from w10;
select is(((tests.best(w10.id)) ->> 'load_kg')::numeric, 0::numeric, 'a bodyweight payload reports added load only') from w10;
select ok((tests.best(w10.id))::text !~ '72\.5', 'the body weight appears nowhere in the payload') from w10;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(tests.best(w10.id)) k),
  '{delta,delta_basis,entered_load,entered_unit,exercise_id,exercise_name,exercise_slug,gain_pct,is_bodyweight,is_per_side,load_kg,pct_of_best,reps,set_id,tier}',
  'the payload has only the allowed fields') from w10;
select is(tests.payload_numbers(tests.best(w10.id)), '{2,20.0,0.000,12}', 'its numbers are only extra reps, gain, added load and reps') from w10;

create temp table w11 as select tests.workout('owner', '2026-01-15') as id;
select tests.lift(w11.id, pullup, 5, 5, 'working', 80) from ex, w11;
select tests.rebuild('owner', pullup) from ex;
select is((tests.best(w11.id)) ->> 'tier', 'pr', 'added weight on a bodyweight lift is an all-time PR') from w11;
select ok((tests.best(w11.id))::text !~ '8[05]\.', 'and that payload doesn''t reveal body weight either') from w11;

select * from finish();
rollback;
