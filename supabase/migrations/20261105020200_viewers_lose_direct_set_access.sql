-- Viewers now read sets only through get_shared_sets. With direct access they could still filter on a
-- hidden column, such as bodyweight_kg=gt.70, and work out the value without ever being shown it.
-- Owners keep full access through workout_sets_owner.
drop policy workout_sets_viewer on public.workout_sets;
