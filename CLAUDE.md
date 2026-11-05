# treino-tracker v2

Cross-platform fitness app for strength training, sports and nutrition. It grows out of a Python CLI that tracked 16
weeks of real training.

**Current state: Phase 0, planning only. No application code exists yet.** The commands below describe the intended
setup and start working once the MVP scaffold lands. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is done.

## Read before changing things

- [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md): what we are building and in which phase
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): what lives where, and why
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): schema, RLS and the v1 import rules
- [docs/ROADMAP.md](docs/ROADMAP.md): delivery checklists

## How to work with Victor

Victor is a CS student who knows Python, pandas, NumPy, Matplotlib and scikit-learn well, and is new to TypeScript and
mobile.

- Act as a senior engineer and mentor. Explain the **why** of each architectural decision in 2–4 sentences.
- Work in small, reviewable steps: one feature per commit.
- Commit with conventional messages: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Ask at most one question at a time, and only when the decision is genuinely Victor's. Otherwise pick the sensible
  default and say what you picked.
- Leave 1–2 small, well-scoped `TODO(victor):` items with a hint in each module. They must never break the build.
- Write all code, comments, commits and docs in English. User-facing strings go through i18n (`en`, `pt-BR`).

## Stack

| Area | Choice |
|---|---|
| Client | Expo (React Native), TypeScript, Expo Router, TanStack Query |
| API | Python 3.12, FastAPI, Pydantic, pandas, NumPy, scikit-learn |
| Data, auth, storage | Supabase: PostgreSQL, Auth, Storage, RLS |
| Food data | USDA FoodData Central, Open Food Facts |
| Food recognition | Claude API vision |
| Package managers | npm (client), uv (API) |

## Folder map

```text
apps/mobile/            Expo app
services/api/
  app/routers/          HTTP only
  app/services/         Orchestration
  app/analytics/        Pure functions: training math
  app/nutrition/        Pure functions: diet math and guardrails
  app/db/admin.py       The only module that may use the Supabase secret key
  scripts/import_v1.py  v1 data import
  tests/
supabase/
  migrations/           Schema changes, the only way the database changes
  seed/                 Exercise catalog and muscle groups
  tests/                pgTAP tests
fixtures/               Test cases shared across languages, such as e1rm_cases.json
data/v1/                Victor's v1 files (gitignored)
docs/
```

## Commands

Available after the MVP scaffold. Local Supabase needs Docker running. `python3` on this machine is 3.9, so always go
through `uv`, which uses the pinned 3.12.

```bash
# First-time setup
npm --prefix apps/mobile install
uv --directory services/api sync
cp .env.example .env

# Run
npx supabase start                                   # Local database, auth and storage
uv --directory services/api run fastapi dev app/main.py
npm --prefix apps/mobile start

# Test
uv --directory services/api run pytest               # Analytics, nutrition, API
npx supabase test db                                 # RLS and database functions
npm --prefix apps/mobile test                        # Client

# Lint and types
uv --directory services/api run ruff check .
npm --prefix apps/mobile run lint
npm --prefix apps/mobile run typecheck

# Database
npx supabase migration new <name>
npx supabase db reset                                # Rebuild locally from migrations and seed
```

## Non-negotiable rules

**Privacy and security**

- Authorization lives in RLS. Never treat a UI or API check as the protection for health data.
- Every new table enables RLS and gets policies in the same migration, plus pgTAP tests for each sharing tier.
- RLS hides rows, not columns. Data with a different sensitivity goes in its own table.
- Clients never write `personal_records` or `feed_events`.
- `SECURITY DEFINER` functions set `search_path = ''`, qualify every name and revoke `EXECUTE` from `public` and `anon`.
- The Supabase secret key stays in `app/db/admin.py` and the import script. Secrets never get an `EXPO_PUBLIC_` prefix.
- Never commit `.env` or anything in `data/`.
- Feed payloads must not contain anything above the event's `required_scope`.

**Health and safety**

- Diet targets never go below the calorie floor. Weight loss above ~1% of body weight a week gets flagged. Users under
  18 get general guidance only, never a deficit.
- Each guardrail has a test that fails if the guardrail is removed.
- Nutrition and supplement screens show "not medical advice".
- AI food estimates are labeled, editable and never saved without confirmation. Nutrients come from food databases,
  never from the model.
- Supplement results use the defined verdicts and always state that correlation is not causation.

**Data correctness**

- Store kg and keep what the user typed in `entered_load` and `entered_unit`. Show the entered value.
- 1 lb = 0.45359237 kg. Use this constant everywhere.
- Weekly buckets use `local_date`, never a UTC timestamp.
- Missing data is `null`, never `0`. Averages and verdicts must handle sparse weeks.
- e1RM and volume are defined in generated columns. Read them rather than recomputing.
- The word "PR" means an all-time record against the user's own history. The first log of an exercise is a baseline.

## Testing expectations

Business logic ships with tests: analytics, nutrition math, guardrails, schedule suggestions and PR detection. Keep
analytics and nutrition as pure functions so they can be tested without a database. Mock external APIs in tests, and
never call USDA, Open Food Facts or Claude from the test suite.
