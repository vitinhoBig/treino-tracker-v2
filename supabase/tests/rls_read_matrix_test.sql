-- Who can read what: every table against every persona, matching the table in docs/DATA_MODEL.md.
-- The expected counts are the rows of the owner's data that each persona should see.
begin;
\ir helpers/fixtures.psql

create table tests.read_matrix (
  label text, tbl text, predicate text,
  owner_rows int, viewer_w int, viewer_b int, viewer_e int, stranger int
);
insert into tests.read_matrix values
  -- Connected users can see the owner's name.
  ('profiles', 'public.profiles', 'id = tests.uid(''owner'')', 1, 1, 1, 1, 0),
  -- Owner-only, even for "everything".
  -- Viewers read sets through get_shared_sets, which masks body weight. Direct access would let them
  -- filter on hidden columns.
  ('workout_sets', 'public.workout_sets', 'user_id = tests.uid(''owner'')', 2, 0, 0, 0, 0),
  ('profile_details', 'public.profile_details', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('user_sports', 'public.user_sports', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('schedule_preferences', 'public.schedule_preferences', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('availability_slots', 'public.availability_slots', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('planned_sessions', 'public.planned_sessions', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('v1_weekly_aggregates', 'public.v1_weekly_aggregates', 'user_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  ('food photos', 'storage.objects', 'name like ''a0000000-0000-4000-8000-000000000001/%''', 1, 0, 0, 0, 0),
  ('custom foods', 'public.foods', 'owner_id = tests.uid(''owner'')', 1, 0, 0, 0, 0),
  -- Workouts tier. Owners see the in-progress session as well, and viewers never do.
  ('workouts', 'public.workouts', 'user_id = tests.uid(''owner'')', 2, 1, 1, 1, 0),
  ('personal_records', 'public.personal_records', 'user_id = tests.uid(''owner'')', 1, 1, 1, 1, 0),
  ('custom exercises', 'public.exercises', 'owner_id = tests.uid(''owner'')', 1, 1, 1, 1, 0),
  ('custom exercise_muscles', 'public.exercise_muscles', 'muscle_group_id = ''test_chest''', 1, 1, 1, 1, 0),
  ('workouts-scope feed', 'public.feed_events', 'required_scope = ''workouts''', 1, 1, 1, 1, 0),
  -- Body tier.
  ('body_metrics', 'public.body_metrics', 'user_id = tests.uid(''owner'')', 1, 0, 1, 1, 0),
  ('body-scope feed', 'public.feed_events', 'required_scope = ''workouts_and_body''', 1, 0, 1, 1, 0),
  -- Everything tier.
  ('daily_wellness', 'public.daily_wellness', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('meals', 'public.meals', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('meal_items', 'public.meal_items', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('nutrition_targets', 'public.nutrition_targets', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('weekly_reviews', 'public.weekly_reviews', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('custom supplements', 'public.supplements', 'owner_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('supplement_logs', 'public.supplement_logs', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('experiments', 'public.experiments', 'user_id = tests.uid(''owner'')', 1, 0, 0, 1, 0),
  ('everything-scope feed', 'public.feed_events', 'required_scope = ''everything''', 1, 0, 0, 1, 0),
  -- Each side of a share sees that row, and nobody else does.
  ('shares', 'public.shares', 'owner_id = tests.uid(''owner'')', 3, 1, 1, 1, 0),
  -- Shared catalogs are readable by every signed-in user.
  ('catalog exercises', 'public.exercises', 'slug = ''test_squat''', 1, 1, 1, 1, 1),
  ('sports', 'public.sports', 'id = ''test_soccer''', 1, 1, 1, 1, 1),
  ('muscle_groups', 'public.muscle_groups', 'id = ''test_chest''', 1, 1, 1, 1, 1),
  ('cached foods', 'public.foods', 'source_id = ''test-1''', 1, 1, 1, 1, 1);
grant select on tests.read_matrix to anon, authenticated;

-- Count what a persona can see. A permission error counts as seeing nothing.
create function tests.visible(p_persona text, p_tbl text, p_predicate text) returns int
language plpgsql as $$
declare v_count int;
begin
  perform tests.become(p_persona);
  begin
    execute format('select count(*) from %s where %s', p_tbl, p_predicate) into v_count;
  exception when insufficient_privilege then
    v_count := 0;
  end;
  perform tests.as_admin();
  return v_count;
end $$;
grant execute on function tests.visible(text, text, text) to anon, authenticated;

select plan(((select count(*) from tests.read_matrix) * 6)::int);

select is(tests.visible(p.persona, m.tbl, m.predicate), p.expected, m.label || ': ' || p.persona)
from tests.read_matrix m
cross join lateral (values
  ('owner', m.owner_rows), ('viewer_w', m.viewer_w), ('viewer_b', m.viewer_b),
  ('viewer_e', m.viewer_e), ('stranger', m.stranger), ('anon', 0)
) as p(persona, expected)
order by m.label, p.persona;

select * from finish();
rollback;
