# Product spec

treino-tracker v2 is a cross-platform fitness app covering strength training, sports and nutrition.
It learns from the user's own history and adapts to them. It grows out of a Python CLI that tracked
16 weeks of real training.

**Launch target: private beta** (confirmed by Victor). The first users are Victor and invited people: a
partner, family, a coach and a few friends. A public store release is a Phase 4 decision.

## Personas

| Persona | Who | What they need |
|---|---|---|
| **Victor, the data-minded lifter** (primary) | Intermediate, trains 3× a week, wants evidence about what works | Fast set logging, honest analytics, weak-point detection, supplement experiments |
| **Bia, the beginner** | Six months in, unsure what to do next | A plan that fits their week, plain-language guidance, encouragement that does not overclaim |
| **Rafa, the athlete** | Plays soccer, lifts twice a week | Sports and lifting in one calendar, a split that works around matches |
| **Marina, the partner or family viewer** | Does not track anything | A simple "trained today" feed, showing only what was shared |
| **Coach Leo** | Reviews a client's training and diet | Deep read access, granted and revocable by the client |

## Scope at a glance

| # | Module | MVP | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|
| 1 | Onboarding and profile | Full | | | |
| 2 | Schedule | Weekly target only | Fixed, flexible, suggestions, reschedule | | Reminders |
| 3 | Workout logging | Full | Sports sessions | | |
| 4 | Progress and insights | Volume, e1RM, consistency | Weak points | | |
| 5 | Nutrition tracker | | Text search, barcode | Photo with AI | |
| 6 | Weekly review | | Full | | Notification |
| 7 | Diet plan generator | | | Full | |
| 8 | Supplement experiments | | | Full | |
| 9 | Sharing | One viewer, "trained today" | Multiple viewers, all scopes in UI | | Kudos |

In the stories below, **[MVP]**, **[P2]**, **[P3]** and **[P4]** give the delivery phase.

## 1. Onboarding and profile

- **O1 [MVP]** As a new user, I sign up and answer a short questionnaire so the app can tailor itself:
  experience level, goal, sports, birth date, height, weight, units and training days available.
- **O2 [MVP]** As a user, I list my equipment access so suggestions only use what I have.
- **O3 [MVP]** As a user, I can choose lbs or kg, and English or Brazilian Portuguese, and change them
  at any time without my data changing.
- **O4 [MVP]** As a user, I can edit my profile and permanently delete my account and all its data.
- **O5 [P3]** As a user, I can provide sex for calorie math, or choose not to.

**Rules**

- The user must be 13 or older. This is a default set for child-privacy law; see the
  [open items](#open-items).
- Birth date is collected rather than age, so age stays correct. Sex is added to the listed onboarding
  fields only when diet plans ship, because nothing before that needs it.

## 2. Schedule

- **S1 [MVP]** As a user, I set a weekly session target so consistency has something to measure.
- **S2 [P2]** As a user, I choose **fixed** (specific weekdays and times), **flexible** (N sessions a
  week, any day) or **custom** (I build it).
- **S3 [P2]** As a user, I get a suggested weekly split that fits my availability and goal.
- **S4 [P2]** As a user who missed a session, I get a revised week rather than a guilt message.
- **S5 [P4]** As a user, I can get a reminder before a planned session.

**Split rules (P2).** These are a transparent, tested rule table rather than a model. For example: 2–3
days gives full body, 4 gives upper/lower, 5–6 gives push/pull/legs, adjusted for goal and equipment,
with sport days treated as lower-body load.

## 3. Workout logging

- **W1 [MVP]** As a user, I log each set individually: exercise, set number, reps, load and optional RPE.
- **W2 [MVP]** As a user, I see last session's numbers prefilled so most sets take one tap.
- **W3 [MVP]** As a user, I get a rest timer that starts when I complete a set.
- **W4 [MVP]** As a user, I can mark a lift as unilateral, where the load is per side.
- **W5 [MVP]** As a user, I see a PR as soon as I log it.
- **W6 [MVP]** As a user, I keep logging when the gym has no signal, and nothing is lost.
- **W7 [MVP]** As a user, I can search the catalog, add a custom exercise and edit past workouts.
- **W8 [MVP]** As a user, I can mark warm-up sets so they do not distort my stats.
- **W9 [P2]** As an athlete, I can log a sport session with its duration and effort.

**Rules**

- e1RM uses Epley, up to 12 reps. A single rep is its own e1RM. Warm-ups are excluded.
- The first log of an exercise sets the baseline and is never announced as a PR.
- Bodyweight lifts combine body weight with added load.

## 4. Progress and insights

- **P1 [MVP]** As a user, I see weekly volume per muscle group.
- **P2 [MVP]** As a user, I see my estimated 1RM trend per exercise.
- **P3 [MVP]** As a user, I see consistency: sessions completed vs my target, and my streak in weeks.
- **P4 [P2]** As a user, I see planned vs completed once I have a schedule.
- **P5 [P2]** As a user, I am told about my weak points, with the reason behind each one.

**Weak-point definitions (P2)**

| Insight | Rule | Why this guard |
|---|---|---|
| Stalled lift | No e1RM gain in 3+ weeks, **with at least 3 sessions of that lift in the window** | Not training a lift is not the same as stalling on it |
| Undertrained muscle | Below a level-based weekly set count, averaged over 4 weeks | A single light week should not trigger it |
| Push/pull imbalance | Push-to-pull set ratio outside 0.67–1.5 over 4 weeks | A short window just reflects the split's order |

Thresholds start as documented defaults and are named constants, so they can be tuned.

## 5. Nutrition tracker

- **N1 [P2]** As a user, I log food by text search (USDA FoodData Central).
- **N2 [P2]** As a user, I log packaged food by scanning a barcode (Open Food Facts).
- **N3 [P2]** As a user, I see calories, protein, carbs and fat per meal and per day.
- **N4 [P2]** As a user, I can create a custom food and reuse recent foods.
- **N5 [P3]** As a user, I photograph a meal and get items with estimated grams, which I confirm or edit
  before anything is saved.

**Rules**

- AI results are labeled as estimates, are always editable and are never saved without confirmation.
- Before the first photo is sent, the user is told it goes to an AI provider for analysis, and agrees.
- Nutrition screens show "not medical advice".

## 6. Weekly review

- **R1 [P2]** As a user, I get a weekly summary: training, nutrition averages and body-weight trend.
- **R2 [P2]** As a user, I see what improved and what slipped.
- **R3 [P2]** As a user, I get **one** concrete suggestion for next week.
- **R4 [P4]** As a user, I am notified when my review is ready.

**Rules.** Suggestions come from tested rules, each tied to the data behind it. When logs are too sparse,
the review says so rather than guessing. A review with no nutrition data leaves that section out.

## 7. Diet plan generator

- **D1 [P3]** As a user, I get calorie and macro targets from my profile and goal, with the reasoning shown.
- **D2 [P3]** As a user, my targets adjust weekly based on my actual weight trend vs my intake.
- **D3 [P3]** As a user, I am warned if my weight is falling faster than is safe.

**Method**

- BMR uses Mifflin-St Jeor. With sex `unspecified`, it averages the male and female constants.
- Protein starts at 1.6–2.2 g/kg depending on goal.
- Estimated TDEE comes from `average intake − (weekly weight change × 7700 / 7)`, using a smoothed weight
  trend.
- A weekly adjustment needs at least 5 logged days and 4 weigh-ins that week. Otherwise targets hold and
  the app says why. Each change is capped at ±150 kcal to keep noise from swinging the plan.

**Guardrails (non-negotiable, and all covered by tests)**

| Situation | Behavior |
|---|---|
| Any target | Never below the floor: 1200 kcal (female), 1500 kcal (male or unspecified) |
| Loss rate above ~1% of body weight a week | Flag it and raise the target; never suggest going faster |
| Under 18 | No deficit targets at all; general guidance only |
| Underweight (BMI below 18.5) and goal is fat loss | No deficit targets; suggest talking to a professional |
| Every plan screen | "Not medical advice" |

## 8. Supplement experiments

- **E1 [P3]** As a user, I start an experiment, such as creatine 5 g/day, and choose what to watch:
  anchor-lift e1RM, volume or body weight.
- **E2 [P3]** As a user, I log my doses, and the app compares a baseline period with the experiment period.
- **E3 [P3]** As a user, I get a verdict in honest language, along with its limits.

**Verdict language**

| Verdict | When |
|---|---|
| **Not enough data** | Fewer than 3 weeks of data in either period, or too few sessions of the anchor lift |
| **Weak signal** | The change is smaller than 2× the normal week-to-week variation in the baseline |
| **Clear change** | The change is at least 2× that variation and holds across most of the period |

**Rules**

- Every result says that correlation is not causation, and that sleep, diet and program changes may
  explain it.
- Results also flag any existing trend in the baseline. If a lift was already climbing, the climb is not
  credited to the supplement.
- Known effects are named. Creatine, for example, commonly raises body weight through water retention.
- A missing dose log counts as unknown, not as zero.
- The app never gives dosing advice, and these screens show "not medical advice".

## 9. Sharing

- **H1 [MVP]** As a user, I invite one person by link to see my workouts. The database already supports the
  wider scopes; the MVP screens offer only this one.
- **H2 [MVP]** As a viewer, I see "Victor trained today — best lift: Squats 230 lb × 10 (+5 lb PR)".
- **H3 [MVP]** As a user, I can revoke access at any time, and it takes effect immediately.
- **H4 [MVP]** As a viewer, I can stop viewing someone.
- **H5 [P2]** As a user, I can have several viewers with different scopes:
  workouts only, workouts + body weight, or everything.
- **H6 [P4]** As a viewer, I can give kudos on a feed event.

**Rules**

- Nothing is shared by default. Sharing is opt-in and enforced by database policies, not just the UI.
- "Best lift" is chosen by **improvement against the user's own history**, not absolute load, so squats do
  not always win. See `DATA_MODEL.md` for the tiers. The word "PR" is used only for a real all-time PR.
- Even with "everything", viewers do not see birth date, weekly schedule or food photos.
- Without body access, viewers see reps and added load on bodyweight lifts, but nothing that reveals body weight.

## Importing v1 data

- **V1 [MVP]** As Victor, I import my 16 weeks of v1 data so charts have real history from day one.
  Importing never produces feed events. See `DATA_MODEL.md` for how the data is handled.

## Outside current scope

Wearable sync, AI coaching chat, payments, public profiles and leaderboards, messaging, and exercise videos.
These are excluded to keep the roadmap finishable. Any of them can be reconsidered after Phase 4.

## Open items

Decisions to settle before a **public** release, none of which block the private beta:

- A legal review of health-data privacy and child-privacy obligations. The 13+ gate and the deletion and
  sharing controls are engineering defaults, not legal advice.
- A published privacy policy, including the AI provider disclosure.
- Whether the guardrail numbers need review by a qualified dietitian.
