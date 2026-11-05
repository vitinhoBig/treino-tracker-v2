# Roadmap

Each phase ends with a working, demonstrable app. A phase is done when its exit check passes. Each checkbox is
roughly one conventional commit or a small series of them, and each module gets 1–2 `TODO(victor):` items.

## Phase 0: Planning

- [x] `CLAUDE.md`
- [x] `docs/PRODUCT_SPEC.md`
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATA_MODEL.md`, with schema and RLS tested on a throwaway Postgres
- [x] `docs/ROADMAP.md`
- [x] Victor approves the plan

## MVP

**Foundations**

- [x] Monorepo scaffold: `apps/mobile`, `services/api`, `supabase/`, `.gitignore`, `.env.example`
- [ ] Local Supabase running, with the schema as migrations
- [ ] RLS test suite in pgTAP, ported from the Phase 0 checks
- [ ] CI: lint and tests for client, API and database on every push
- [ ] FastAPI skeleton: `/health`, JWT verification, error format
- [ ] Expo skeleton: routing, TanStack Query, i18n (English, Brazilian Portuguese), unit formatting

**Onboarding and profile**

- [ ] Sign up, sign in and sign out
- [ ] Onboarding questionnaire with the 13+ gate
- [ ] Profile editing, including units and language
- [ ] Permanent account deletion

**Exercise catalog**

- [ ] Seed muscle groups and exercises, covering everything in v1
- [ ] Search, filter and custom exercises

**Workout logging**

- [ ] Log per set, with exercise, reps, load and optional RPE
- [ ] Prefill from last session
- [ ] Rest timer
- [ ] Unilateral, warm-up and bodyweight handling
- [ ] Local draft that survives no signal and an app restart
- [ ] `finish_workout` with PR detection and pgTAP tests
- [ ] Live PR preview, tested against the shared e1RM fixture
- [ ] Editing and deleting past workouts, with PR recompute

**Progress**

- [ ] Port v1 analytics to `services/api/app/analytics`, with tests
- [ ] Volume per muscle group per week
- [ ] e1RM trend per exercise
- [ ] Consistency: completed vs weekly target, and streak

**Sharing**

- [ ] Invite link, accept and revoke
- [ ] "Trained today" feed event with best-lift selection
- [ ] Viewer feed screen

**v1 import**

- [ ] Exercise mapping file, reviewed by Victor
- [ ] `services/api/scripts/import_v1.py`, with `--dry-run`, and tests
- [ ] Import real data and check totals week by week

**Exit check:** Victor logs a real gym session on a phone, including a stretch in airplane mode. A PR appears, an
invited viewer sees the correct feed line, and revoking access removes it. Charts show the 16 imported weeks.

## Phase 2: Plan and eat

- [ ] Sports sessions in logging
- [ ] Schedule modes: fixed, flexible and custom
- [ ] Weekly split suggestions from a tested rule table
- [ ] Rescheduling after a missed session
- [ ] Planned vs completed consistency
- [ ] Weak points: stalled lifts, undertrained muscles and push/pull imbalance
- [ ] Multiple viewers and all three sharing scopes in the UI
- [ ] Food search through USDA, with caching
- [ ] Barcode logging through Open Food Facts
- [ ] Meal logging with per-meal and daily totals
- [ ] Weekly review with one concrete suggestion

**Exit check:** a full real week runs through the app, from plan to review, and the suggestion points to specific data.

## Phase 3: Adapt

- [ ] Photo food logging with consent, strict schema and USDA matching
- [ ] Labeled photo set to measure recognition quality
- [ ] Calorie and macro targets from profile and goal
- [ ] Guardrail test suite: calorie floor, loss-rate flag, under-18 and underweight rules
- [ ] Weekly target adjustment from weight trend vs intake
- [ ] Supplement experiments with baseline comparison and honest verdicts
- [ ] "Not medical advice" on all nutrition and supplement screens

**Exit check:** every guardrail has a test that fails if it is removed. Victor's creatine experiment produces a verdict
with its limits stated, using data logged in v2.

## Phase 4: Ship

- [ ] Notifications: planned sessions and weekly review
- [ ] Kudos on feed events
- [ ] Performance and accessibility pass, plus full Portuguese review
- [ ] Deploy the API to a managed host, with error monitoring
- [ ] Production Supabase project, with backups confirmed
- [ ] Expo EAS builds for iOS and Android
- [ ] Privacy policy, and the open items in `PRODUCT_SPEC.md` if going public
- [ ] Portfolio README with screenshots and an architecture summary

**Exit check:** someone outside the project installs the app from a build link and logs a workout with no help.
