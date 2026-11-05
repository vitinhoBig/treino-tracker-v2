-- Food cache, meals, targets and weekly reviews.
-- Designed in docs/DATA_MODEL.md.

create table public.foods (
  id                 uuid primary key default gen_random_uuid(),
  source             public.food_source not null,
  source_id          text,
  owner_id           uuid references public.profiles (id) on delete cascade,
  name               text not null,
  brand              text,
  barcode            text,
  kcal_per_100g      numeric(6, 1) not null check (kcal_per_100g >= 0),
  protein_per_100g   numeric(5, 2) not null check (protein_per_100g >= 0),
  carbs_per_100g     numeric(5, 2) not null check (carbs_per_100g >= 0),
  fat_per_100g       numeric(5, 2) not null check (fat_per_100g >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (source, source_id),
  check ((source = 'custom') = (owner_id is not null)),
  check (source = 'custom' or source_id is not null)
);

create index foods_barcode_idx on public.foods (barcode) where barcode is not null;

create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);

create index foods_owner_idx on public.foods (owner_id) where owner_id is not null;

create table public.meals (
  id          uuid primary key,  -- client-generated
  user_id     uuid not null references public.profiles (id) on delete cascade,
  local_date  date not null,
  eaten_at    timestamptz not null,
  meal_type   public.meal_type not null,
  photo_path  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);

create index meals_user_date_idx on public.meals (user_id, local_date desc);

create table public.meal_items (
  id              uuid primary key,  -- client-generated
  meal_id         uuid not null,
  user_id         uuid not null,
  food_id         uuid references public.foods (id) on delete set null,
  food_name       text not null,
  grams           numeric(7, 2) not null check (grams > 0),
  kcal            numeric(7, 1) not null check (kcal >= 0),
  protein_g       numeric(6, 2) not null check (protein_g >= 0),
  carbs_g         numeric(6, 2) not null check (carbs_g >= 0),
  fat_g           numeric(6, 2) not null check (fat_g >= 0),
  entry_method    public.entry_method not null,
  ai_food_label   text,
  ai_grams        numeric(7, 2),
  created_at      timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade,
  check ((entry_method = 'photo_ai') = (ai_grams is not null))
);

create index meal_items_meal_idx on public.meal_items (meal_id);

create index meal_items_food_idx on public.meal_items (food_id) where food_id is not null;

create table public.nutrition_targets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  effective_from  date not null,
  kcal            integer not null check (kcal > 0),
  protein_g       integer not null check (protein_g >= 0),
  carbs_g         integer not null check (carbs_g >= 0),
  fat_g           integer not null check (fat_g >= 0),
  estimated_tdee  integer,
  floor_applied   boolean not null default false,
  rationale       jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table public.weekly_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_start   date not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  unique (user_id, week_start)
);

create trigger foods_updated before update on public.foods
  for each row execute function public.set_updated_at();

create trigger meals_updated before update on public.meals
  for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

alter table public.meals enable row level security;

alter table public.meal_items enable row level security;

alter table public.nutrition_targets enable row level security;

alter table public.weekly_reviews enable row level security;

create policy meals_owner on public.meals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy meals_viewer on public.meals for select to authenticated
  using (public.can_view(user_id, 'everything'));

create policy meal_items_owner on public.meal_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy meal_items_viewer on public.meal_items for select to authenticated
  using (public.can_view(user_id, 'everything'));

-- Server-computed and read-only for clients; the API writes them on the user's behalf.
create policy nutrition_targets_select on public.nutrition_targets for select to authenticated
  using (public.can_view(user_id, 'everything'));

create policy weekly_reviews_select on public.weekly_reviews for select to authenticated
  using (public.can_view(user_id, 'everything'));

-- Foods: everyone reads the shared cache, but users can write only their own custom foods.
-- Viewers do not need other people's custom foods because meal_items snapshots the name and macros.
create policy foods_select on public.foods for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

create policy foods_insert on public.foods for insert to authenticated
  with check (owner_id = (select auth.uid()) and source = 'custom');

create policy foods_update on public.foods for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and source = 'custom');

create policy foods_delete on public.foods for delete to authenticated
  using (owner_id = (select auth.uid()));
