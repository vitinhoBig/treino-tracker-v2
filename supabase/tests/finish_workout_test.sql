-- finish_workout and recompute_prs, called the way the app calls them: as the signed-in user.
begin;
\ir helpers/fixtures.psql
\ir helpers/training.psql

select plan(38);

create temp table ex as select tests.exercise('squat') as squat, tests.exercise('bench') as bench;
create temp table d as select current_date as today;
grant select on ex, d to authenticated, anon;

-- Earlier history, then today's session still in progress.
select tests.lift(tests.workout('owner', today - 7), squat, 10, 100) from ex, d;
create temp table w as select tests.workout('owner', today, 'in_progress') as id from d;
grant select on w to authenticated, anon;
select tests.lift(w.id, squat, 10, 110) from ex, w;

-- Access.
select tests.as_anon();
select throws_ok(format('select public.finish_workout(%L)', (select id from w)), '42501', null, 'anon cannot finish a workout');
select throws_ok(format('select public.recompute_prs(%L)', (select squat from ex)), '42501', null, 'anon cannot recompute records');

select tests.as_user('viewer_e');
select throws_ok(format('select public.finish_workout(%L)', (select id from w)), 'PT404', null, 'a viewer cannot finish the owner''s workout');
select tests.as_user('stranger');
select throws_ok(format('select public.finish_workout(%L)', (select id from w)), 'PT404', null, 'a stranger cannot finish it');
select throws_ok($$select public.finish_workout('00000000-0000-4000-8000-000000000000')$$, 'PT404', null, 'a missing workout gives the same error');
select tests.as_admin();
select is((select status::text from public.workouts where id = (select id from w)), 'in_progress', 'failed attempts changed nothing');

-- A viewer can't see the session yet.
select tests.as_user('viewer_w');
select is((select count(*)::int from public.workouts where id = (select id from w)), 0, 'an in-progress workout is hidden from viewers');

-- The owner finishes it.
select tests.as_user('owner');
create temp table result as select public.finish_workout((select id from w)) as r;
grant select on result to authenticated, anon;
select tests.as_admin();
select is((select status::text from public.workouts where id = (select id from w)), 'completed', 'the workout is completed');
select isnt((select ended_at from public.workouts where id = (select id from w)), null, 'ended_at is set');
select is((select r -> 'best_lift' ->> 'tier' from result), 'pr', 'the response gives the best lift for the summary screen');
select is((select jsonb_array_length(r -> 'records') from result), 2, 'the response lists the confirmed records');
select is((select (r ->> 'published')::boolean from result), true, 'the response says it was published');
select is((select count(*)::int from public.personal_records where workout_id = (select id from w)), 2, 'records are written');
select is((select count(*)::int from public.feed_events where workout_id = (select id from w)), 1, 'one feed event is written');
select is((select actor_id from public.feed_events where workout_id = (select id from w)), tests.uid('owner'), 'it belongs to the owner');
select is((select required_scope::text from public.feed_events where workout_id = (select id from w)), 'workouts', 'workouts viewers can see it');

select tests.as_user('viewer_w');
select is((select payload -> 'best_lift' ->> 'exercise_slug' from public.feed_events where workout_id = (select id from w)), 'squat', 'a workouts-scope viewer reads the feed line');
select is((select count(*)::int from public.workouts where id = (select id from w)), 1, 'and can now see the finished workout');

-- Retrying after a dropped connection.
-- now() is frozen inside a transaction, so plant an earlier finish time to prove it's kept.
select tests.as_admin();
update public.workouts set ended_at = started_at + interval '1 hour' where id = (select id from w);
create temp table ended as select ended_at from public.workouts where id = (select id from w);
grant select on ended to authenticated, anon;
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from w)), 'finishing again is safe');
select tests.as_admin();
select is((select count(*)::int from public.personal_records where workout_id = (select id from w)), 2, 'a retry adds no records');
select is((select count(*)::int from public.feed_events where workout_id = (select id from w)), 1, 'a retry adds no feed events');
select is((select ended_at from public.workouts where id = (select id from w)), (select ended_at from ended), 'a retry keeps the first finish time');

-- A phone clock ahead of the server.
create temp table fast as select tests.workout('owner', today, 'in_progress') as id from d;
grant select on fast to authenticated, anon;
update public.workouts set started_at = now() + interval '1 hour' where id = (select id from fast);
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from fast)), 'a phone clock running ahead doesn''t break finishing');

-- When nothing should be published.
select tests.as_admin();
create temp table stranger_w as select tests.workout('stranger', today, 'in_progress') as id from d;
grant select on stranger_w to authenticated, anon;
select tests.lift(id, (select squat from ex), 10, 100) from stranger_w;
select tests.as_user('stranger');
select lives_ok(format('select public.finish_workout(%L)', (select id from stranger_w)), 'finishing with no share works');
select tests.as_admin();
select is((select count(*)::int from public.feed_events where workout_id = (select id from stranger_w)), 0, 'no share means no feed event');

create temp table old_w as select tests.workout('owner', today - 30, 'in_progress') as id from d;
grant select on old_w to authenticated, anon;
select tests.lift(id, (select bench from ex), 10, 50) from old_w;
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from old_w)), 'finishing a backdated workout works');
select tests.as_admin();
select is((select count(*)::int from public.feed_events where workout_id = (select id from old_w)), 0, 'a backdated workout doesn''t announce "trained today"');

create temp table empty_w as select tests.workout('owner', today, 'in_progress') as id from d;
grant select on empty_w to authenticated, anon;
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from empty_w)), 'finishing an empty workout works');
select tests.as_admin();
select is((select count(*)::int from public.feed_events where workout_id = (select id from empty_w)), 0, 'an empty workout announces nothing');

-- Imported history must not notify anyone, even if it's dated today.
select tests.as_admin();
create temp table import_w as select tests.workout('owner', today, 'in_progress') as id from d;
grant select on import_w to authenticated, anon;
update public.workouts set source = 'v1_import', source_ref = 'week01-tuesday' where id = (select id from import_w);
select tests.lift(id, (select bench from ex), 10, 52) from import_w;
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from import_w)), 'finishing an imported workout works');
select tests.as_admin();
select is((select count(*)::int from public.feed_events where workout_id = (select id from import_w)), 0, 'imported workouts announce nothing');

-- A sport session has no sets, but it's still training.
insert into public.workouts (id, user_id, type, sport_id, local_date, started_at, status)
  values ('b0000000-0000-4000-8000-0000000000c1', tests.uid('owner'), 'sport', 'test_soccer', current_date, now(), 'in_progress');
select tests.as_user('owner');
select public.finish_workout('b0000000-0000-4000-8000-0000000000c1');
select tests.as_admin();
select is((select payload ->> 'sport_id' from public.feed_events where workout_id = 'b0000000-0000-4000-8000-0000000000c1'), 'test_soccer', 'a sport session publishes without a best lift');

-- A bad timezone must not block finishing.
update public.profiles set timezone = 'Not/AZone' where id = tests.uid('owner');
create temp table tz_w as select tests.workout('owner', today, 'in_progress') as id from d;
grant select on tz_w to authenticated, anon;
select tests.lift(id, (select bench from ex), 10, 55) from tz_w;
select tests.as_user('owner');
select lives_ok(format('select public.finish_workout(%L)', (select id from tz_w)), 'an invalid timezone falls back to UTC');
select tests.as_admin();
update public.profiles set timezone = 'UTC' where id = tests.uid('owner');

-- Fixing a typo after publishing.
create temp table typo as select id as set_id from public.workout_sets
  where workout_id = (select id from w) and exercise_id = (select squat from ex);
grant select on typo to authenticated, anon;
update public.workout_sets set load_kg = 90 where id = (select set_id from typo);
select tests.as_user('owner');
select is(public.recompute_prs((select squat from ex)), 0, 'recomputing after a fix removes the false records');
select tests.as_admin();
select is((select payload -> 'best_lift' ->> 'tier' from public.feed_events where workout_id = (select id from w)), 'near_best', 'the feed line stops claiming a PR');

-- Removing the highlighted lift entirely.
delete from public.workout_sets where id = (select set_id from typo);
select tests.as_user('owner');
select is(public.recompute_prs((select squat from ex)), 0, 'recomputing after a delete works');
select tests.as_admin();
select is((select payload -> 'best_lift' from public.feed_events where workout_id = (select id from w)), 'null'::jsonb, 'the feed stops naming a lift that was deleted');

-- recompute_prs only ever touches your own records.
select tests.as_admin();
select tests.lift(tests.workout('viewer_b', today - 7), bench, 10, 50) from ex, d;
select tests.lift(tests.workout('viewer_b', today), bench, 10, 60) from ex, d;
select tests.rebuild('viewer_b', bench) from ex;
select tests.as_user('stranger');
select public.recompute_prs((select bench from ex));
select tests.as_admin();
select is((select count(*)::int from public.personal_records r, ex where r.user_id = tests.uid('viewer_b') and r.exercise_id = ex.bench), 2, 'someone else recomputing an exercise leaves your records alone');

select * from finish();
rollback;
