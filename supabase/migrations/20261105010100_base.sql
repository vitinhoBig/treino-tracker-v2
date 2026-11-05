-- Extensions, enum types and the shared updated_at trigger function. Also removes the scaffold hello().
-- Designed in docs/DATA_MODEL.md.

drop function public.hello();

create extension if not exists pg_trgm with schema extensions;

create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');

create type public.goal_type as enum
  ('build_muscle', 'lose_fat', 'strength', 'sport_performance', 'general_health');

create type public.sex_for_calc as enum ('female', 'male', 'unspecified');

create type public.unit_system as enum ('metric', 'imperial');

create type public.load_unit as enum ('kg', 'lb');

create type public.schedule_mode as enum ('fixed', 'flexible', 'custom');

create type public.planned_status as enum ('planned', 'completed', 'missed', 'rescheduled');

create type public.load_type as enum ('external', 'bodyweight');

create type public.muscle_role as enum ('primary', 'secondary');

create type public.movement_pattern as enum ('push', 'pull', 'legs', 'core', 'other');

create type public.workout_type as enum ('strength', 'sport');

create type public.workout_status as enum ('in_progress', 'completed');

create type public.set_type as enum ('warmup', 'working', 'drop', 'failure');

create type public.pr_type as enum ('e1rm', 'load', 'reps_at_load');

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type public.food_source as enum ('usda', 'open_food_facts', 'custom');

create type public.entry_method as enum ('search', 'barcode', 'photo_ai', 'manual');

create type public.experiment_status as enum ('planned', 'running', 'completed', 'abandoned');

-- Declaration order is meaningful: enums compare by position, so
-- `scope >= 'workouts_and_body'` means "at least this much access".
-- Only ever append wider tiers to the end.
create type public.share_scope as enum ('workouts', 'workouts_and_body', 'everything');

create type public.share_status as enum ('pending', 'active', 'revoked');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
