# Mini Hiring Pipeline

A small hiring tool for **one recruiter managing candidates for one job**. Candidates move through
`Applied → Screening → Interview → Offer → Hired` (or are `Rejected` at any point before being hired), every
move is written to an append-only audit trail, and a single search box understands plain-English questions
like *"Who has been stuck in Screening for more than a week?"* — with no AI API involved.

- [Overview](#overview) · [Features](#features) · [Tech Stack](#tech-stack) · [Architecture](#architecture)
- [Data Model](#data-model) · [Pipeline Rules](#pipeline-rules) · [Immutable Audit Trail](#immutable-audit-trail)
- [Search](#search) · [API](#api) · [Running Locally](#running-locally) · [Environment Variables](#environment-variables)
- [Testing](#testing) · [Design Decisions](#design-decisions) · [Trade-offs](#trade-offs)
- [What I'd Do With More Time](#what-id-do-with-more-time) · [AI Usage](#ai-usage)

---

## Overview

The problem is deliberately small; the interesting part is doing the small things *correctly*:

- **The pipeline has rules and the server enforces them.** One step forward at a time, no skipping, no going
  back, `Hired` and `Rejected` are final. The UI hides impossible actions, but only the backend decides.
- **History can be trusted.** Every stage change creates an audit row in the same transaction as the change,
  and that table cannot be edited or deleted — by the API, or (via triggers) by the database itself.
- **Recruiters can see how long someone has been stuck.** Time-in-stage is derived from server timestamps.
- **Search is predictable.** A deterministic parser turns a sentence into structured filters, PostgreSQL
  trigram matching handles typos, and the UI shows exactly how the query was understood.

Quick start (details and prerequisites in [Running Locally](#running-locally)):

```bash
npm install
cp .env.example .env
# create the two databases (see below), then:
npm run prisma:generate
npx prisma migrate deploy --schema=prisma/schema.prisma
npm run db:seed
npm run dev:backend      # terminal 1 → http://localhost:4000
npm run dev:frontend     # terminal 2 → http://localhost:5173
```

The longer, phase-by-phase history of how this was built (decisions, calibration data, verification detail) is
kept in [`docs/build-notes.md`](docs/build-notes.md). This README is the up-to-date overview.

---

## Features

**Pipeline**
- Kanban board: Applied · Screening · Interview · Offer · Hired, with Rejected as its own section.
- Each card shows name, email, stage, and how long the candidate has been in that stage; actions are
  **Move to next stage**, **Reject** (with a confirmation dialog) and **Open**.
- Add a candidate (name, email, optional phone) with client-side and server-side validation.
- Loading, success and error feedback for every action; empty, loading and error states throughout.

**Rules and audit trail**
- Forward-only, one-step transitions; `Hired` and `Rejected` are final; any non-final stage can be rejected.
- Immutable, append-only stage history, enforced in the API *and* the database.
- Candidate details drawer with a chronological timeline and *"Currently in Interview for 3 days 7 hours"*,
  computed from server timestamps.

**Search**
- One global search box: names (exact / prefix / typo-tolerant), current stage, time in stage, stage movement
  with dates, hiring outcome, exclusions — and any combination of them.
- Results ranked by relevance, showing the filters applied and *why* a name matched ("Fuzzy name match").
- A helpful explanation, instead of "no results", when a query can't be understood.
- Debounced typing, cancellation of superseded requests, and explicit handling of slow, failed and empty searches.

**Engineering**
- TypeScript throughout; layered backend; typed API client; responsive, keyboard-accessible UI.
- **431 automated tests** (238 backend against a real PostgreSQL, 193 frontend), including concurrency tests.

---

## Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 | No UI kit, no state library, no router — see [decisions](#design-decisions) |
| Backend | Node.js 20+, Express 5, TypeScript | `zod` for request validation; async errors flow to one error middleware |
| Database | PostgreSQL (developed on 14) | Enums, foreign keys, `CHECK`, triggers, row locks, `pg_trgm` |
| ORM | Prisma 5.22 | Pinned to 5.x; raw SQL for what Prisma can't model (see below) |
| Testing | Vitest, Supertest, Testing Library, jsdom | Backend tests hit a real database — nothing about Prisma is mocked |
| Repo | npm workspaces monorepo | `backend/`, `frontend/`, shared `prisma/` |

---

## Architecture

```
   Browser
      │   React SPA (Vite dev server, :5173)
      ▼
┌─────────────────────────────────────────────────────────────┐
│ React frontend                                              │
│   components ── hooks (usePipeline, useCandidateDetails,    │
│                        useSearchInput) ── api client        │
└───────────────────────────┬─────────────────────────────────┘
                            │  fetch  /api/*   (Vite proxies to :4000 in dev)
                            ▼
                        REST API
┌─────────────────────────────────────────────────────────────┐
│ Express 5 (:4000)                                           │
│   routes → controllers → validation (zod) → services        │
│                                              │              │
│              ┌───────────────────────────────┤              │
│              ▼                               ▼              │
│   domain/  transition rules        search/  query parser    │
│   (pure functions, no I/O)         (pure functions, no I/O) │
│                                                             │
│   middleware/errorHandler: domain error → HTTP status       │
└───────────────────────────┬─────────────────────────────────┘
                            │  Prisma Client  (+ raw SQL: row lock, trigram ranking)
                            ▼
                        Prisma
                            │
                            ▼
                       PostgreSQL
              tables · enum · FK · CHECK · append-only triggers · pg_trgm
```

### Backend layers

| Layer | Responsibility | Knows about HTTP? | Touches the DB? |
| --- | --- | :-: | :-: |
| `routes/` | Map a path to a controller | yes | no |
| `controllers/` | Parse input, call a service, shape the response | yes | no |
| `validation/` | zod schemas → `RequestValidationError` | no | no |
| `services/` | Business operations; the transaction lives here | no | yes |
| `domain/` | Transition rules and typed errors — **pure** | no | no |
| `search/` | Query parser, date/stage vocabulary — **pure** | no | no |
| `middleware/` | The single place a thrown error becomes a status code | yes | no |

Keeping `domain/` and `search/` free of I/O is what makes them cheap to test exhaustively (the parser has 100
unit tests and never starts a server or opens a connection).

### Life of a transition request

`POST /api/candidates/:id/transition {"toStage": "SCREENING"}`

1. **Validation** — zod checks the body names a known stage → otherwise `400`.
2. The **service** opens a transaction and **locks the candidate row** (`SELECT … FOR UPDATE`).
3. It reads the candidate → missing → `404`.
4. **Domain** `validateTransition(current, target)` → skip / backwards / final / no-op → `409` with a reason.
5. It updates `Candidate.currentStage` and inserts the `StageHistory` row **in the same transaction**,
   using a server-side timestamp.
6. Commit; the controller returns the updated candidate.

### Search pipeline

```
User query ──▶ Query parser ──▶ Structured filters ──▶ Database query ──▶ Fuzzy ranking ──▶ Results
 (free text)   (regex           (ParsedFilters)        (Prisma `where`     (pg_trgm          (ranked list +
                extractors,                             for everything      word_similarity,  parsed filters +
                no LLM)                                 except the name)    tiered)           match reasons)
```

A worked example, `Priya in Screening for more than 7 days`:

```
parse   →  { name: { query: "Priya" },
             currentStage: "SCREENING",
             currentStageDuration: { operator: ">", durationDays: 7 } }

query   →  candidates WHERE currentStage = SCREENING AND updatedAt < now() - 7 days
rank    →  among those, order by name match: exact > prefix > strong fuzzy > weak fuzzy (drop the rest)
respond →  { success, parsedQuery, results: [{ …candidate, score, matchType }] }
```

### Frontend

Data flows one way: `App → PipelineBoard → StageColumn → CandidateCard`; cards are presentational.

- **`usePipeline`** owns everything mirrored from the server (candidate list, per-card pending state, search
  results). Actions resolve with the updated candidate and *throw* on failure; they never touch the UI —
  `App` turns results into toasts. That keeps the hook testable without rendering anything.
- **Updates are pessimistic**: a card doesn't move until the server confirms, then takes the server's response.
  A `409`/`404` triggers a silent refetch so a stale board corrects itself.
- **`useCandidateDetails`** fetches candidate + history by id for the drawer, never reusing the board's copy.
- **`useSearchInput`** is the search box: debounce, Enter, clearing, no duplicate sends.
- `domain/stages.ts` mirrors the transition rules **for UX only** (which buttons to offer).

### Repository layout

```
.
├── backend/
│   ├── src/
│   │   ├── routes/  controllers/  validation/  services/  middleware/
│   │   ├── domain/        stageTransitions.ts, errors.ts          (pure)
│   │   ├── search/        queryParser.ts, dateWords.ts, …         (pure)
│   │   └── db/prisma.ts   config/env.ts   app.ts   index.ts
│   └── tests/             domain/ services/ api/ search/ controllers/ helpers/
├── frontend/
│   └── src/
│       ├── api/  domain/  hooks/  components/  test/
│       └── App.tsx  main.tsx
├── prisma/
│   ├── schema.prisma
│   ├── migrations/        ← includes the triggers and the pg_trgm extension (raw SQL)
│   └── seed.ts            ← 12 candidates across every stage, with backdated history
├── docs/build-notes.md    ← per-phase build log
├── .env.example
└── package.json           ← workspace root: scripts for both apps and the database
```

---

## Data Model

```
┌───────────────────────────┐           ┌─────────────────────────────────┐
│ Candidate                 │ 1       * │ StageHistory                    │
├───────────────────────────┤───────────├─────────────────────────────────┤
│ id            cuid  PK    │           │ id           cuid  PK           │
│ name          text        │           │ candidateId  FK → Candidate.id  │
│ email         text  UNIQUE│           │              ON DELETE RESTRICT │
│ phone         text?       │           │ fromStage    Stage   NOT NULL   │
│ currentStage  Stage       │           │ toStage      Stage   NOT NULL   │
│               default     │           │ changedAt    timestamp          │
│               APPLIED     │           │ CHECK fromStage <> toStage      │
│ createdAt     timestamp   │           └─────────────────────────────────┘
│ updatedAt     timestamp   │
└───────────────────────────┘
   Stage = APPLIED | SCREENING | INTERVIEW | OFFER | HIRED | REJECTED
```

**Candidate** is the current state of a person in the pipeline. **StageHistory** is the record of *transitions*:
one row every time `currentStage` changes, holding where they came from, where they went, and when.

**Indexes:** unique on `Candidate.email`; `Candidate(currentStage)` for the board and stage filters;
`StageHistory(candidateId)` for a candidate's timeline; a **GIN trigram index** on `Candidate.name` for fuzzy search.

Modelling choices worth knowing:

- **There is no history row for creation.** `fromStage`/`toStage` are both required, so a row always means a
  real move. A candidate's start in `Applied` is `Candidate.createdAt`; the UI timeline adds that first
  "Applied" entry from it. (The alternative — a synthetic `null → APPLIED` row — needs a nullable column and a
  special case everywhere.)
- **`updatedAt` doubles as "time entered the current stage".** A candidate row is only ever written at creation
  and on a transition (which sets `updatedAt` to the transition's timestamp), so `updatedAt` *is* the start of
  the current stage. This is convenient (search filters on it directly) but it is an invariant, not a
  guarantee — see [Trade-offs](#trade-offs).
- **`currentStage` is a denormalised copy** of the last history row's `toStage`, kept for fast board and
  search queries. The transaction plus row lock is what keeps the two in agreement.
- **Some schema objects live only in SQL migrations, not in `schema.prisma`**: the append-only triggers, the
  `CHECK` constraint, and the `pg_trgm` extension/index. Use `prisma migrate` (as below); `prisma db push`
  would silently skip them.

---

## Pipeline Rules

```
   Applied ──▶ Screening ──▶ Interview ──▶ Offer ──▶ Hired   (final)
      │            │             │           │
      └────────────┴─────────────┴───────────┴───────▶ Rejected   (final)
```

- A candidate moves **exactly one stage forward** at a time.
- **Skipping** stages is forbidden. **Moving backwards** is forbidden. "Moving" to the current stage is refused.
- **Hired** is final. **Rejected** is final. So a hired candidate cannot be rejected, and a rejected candidate
  cannot be moved forward (or anywhere).
- Any **non-final** stage (Applied, Screening, Interview, Offer) can move to **Rejected**.

Every one of the 36 possible moves (generated from the real `validateTransition`, not written by hand):

| from ↓ \ to → | Applied | Screening | Interview | Offer | Hired | Rejected |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| **Applied** | = | ✅ | skip | skip | skip | ✅ |
| **Screening** | back | = | ✅ | skip | skip | ✅ |
| **Interview** | back | back | = | ✅ | skip | ✅ |
| **Offer** | back | back | back | = | ✅ | ✅ |
| **Hired** | final | final | final | final | final | final |
| **Rejected** | final | final | final | final | final | final |

✅ allowed · `skip` skips a stage · `back` goes backwards · `=` already in that stage · `final` from a final stage.

Refusals are `409 Conflict` with a specific message, for example:

| Attempt | Message |
| --- | --- |
| Applied → Interview | `Cannot skip stages: APPLIED must move to SCREENING before INTERVIEW.` |
| Interview → Screening | `Cannot move backwards from INTERVIEW to SCREENING.` |
| Screening → Screening | `Candidate is already in the SCREENING stage.` |
| Hired → anything (incl. Rejected) | `Hired is a final stage and cannot be changed.` |
| Rejected → anything | `Rejected is a final stage and cannot be changed.` |

The order of checks matters: final stages are checked first, which is why `Hired → Rejected` is refused by the
same rule as every other move away from `Hired`, with no special case.

---

## Immutable Audit Trail

The requirement is that history is never edited or deleted. "There's no endpoint for it" is not enough — a
bug, a script or a hurried `psql` session would defeat it — so it is enforced in layers:

| Layer | What it does |
| --- | --- |
| **API** | No route updates or deletes history; `GET …/history` is the only history endpoint. Any other method is a `404`. |
| **Database triggers** | `BEFORE UPDATE` and `BEFORE DELETE` triggers on `StageHistory` raise an exception unconditionally — for the app, for `psql`, for anyone. |
| **`CHECK` constraint** | `fromStage <> toStage`: a row must record a real change. |
| **Foreign key** | `ON DELETE RESTRICT`: a candidate with history cannot be deleted out from under it. |
| **Transaction** | The stage update and the history insert commit together or not at all — no stage change without a record, no record without a change. |
| **Row lock** | Concurrent requests for the same candidate are serialised, so history is always a true chain (each row starts where the previous ended). |
| **Server timestamps** | `changedAt` is always `new Date()` on the server. The transition service accepts no timestamp from a caller, so an HTTP client can never backdate history. |

Try it against a migrated, seeded database:

```bash
psql -U postgres -h localhost -d mini_hiring_pipeline -c "UPDATE \"StageHistory\" SET \"toStage\" = 'HIRED'"
# ERROR:  StageHistory rows are append-only and cannot be UPDATE (id=…)

psql -U postgres -h localhost -d mini_hiring_pipeline -c 'DELETE FROM "StageHistory"'
# ERROR:  StageHistory rows are append-only and cannot be DELETE (id=…)
```

**What this does *not* protect against** — stated plainly:

- A database superuser or table owner can `DROP TRIGGER` or `TRUNCATE`. `TRUNCATE` bypasses row-level triggers,
  and the seed script and test reset helper use it deliberately (clearly commented). Production would want the
  app to connect as a role that owns nothing and cannot alter triggers.
- The trail is **not tamper-evident**: there is no hash chain or signature, so someone with that access could
  rewrite history without a trace.
- Rows record *what* changed and *when*, but not **who** did it — there is no actor (see
  [More Time](#what-id-do-with-more-time)).

---

## Search

`GET /api/search?q=<query>` converts a recruiter's sentence into structured filters — **deterministically**
(regex extractors over a small vocabulary; see [why not an LLM](#3-why-deterministic-search-instead-of-an-llm)).

### What it understands

Phrases are case-insensitive and word order around them is free. `<Stage>` is Applied, Screening, Interview,
Offer, Hired or Rejected (plus synonyms such as *interviewing*, *offered*).

| Concept | Example queries | Becomes |
| --- | --- | --- |
| Name (exact, prefix, fuzzy) | `Find Priya Sharma` · `priya` · `sharam` | `name` |
| Current stage | `Who's in Interview right now?` · `Offer candidates` · `hired` | `currentStage` |
| Time in current stage | `stuck in Screening for more than a week` · `in Offer for at least 3 days` | `currentStage` + `currentStageDuration` |
| Stage movement + date | `moved to Interview since Monday` · `… since yesterday` · `… since 3 days ago` · `… since 2026-09-01` · `reached Offer` | `movedToStage` |
| Hiring outcome | `reached the Offer stage but didn't get hired` · `Offer candidates who were not hired` | `reachedStageNotHired` |
| Exclusion | `everyone except rejected candidates` | `excludeStages` |
| Everyone | `everyone` · `all candidates` | no filters |

Duration comparators: `more than`/`over` (>), `at least` (≥), `less than`/`under` (<), `at most`/`no more than` (≤),
`exactly` (=); a bare `for 7 days` means "at least". `a week` = 7 days. Dates after `since`: a weekday
(the most recent one, today included), `today`, `yesterday`, `N days ago`, or `YYYY-MM-DD`.

Conditions **combine with AND**: `Priya in Screening for more than 7 days`, `people who moved to Interview
since Monday`, `sharam in Applied`, `Priya except rejected candidates`.

How the parser works: a fixed sequence of extractors each either consumes its phrase or does nothing; whatever
text is left (minus filler words like "who", "is", "right now") is treated as a candidate name.

### Parsed examples

| Query | Parsed |
| --- | --- |
| `Who's in Interview right now?` | `{ currentStage: "INTERVIEW" }` |
| `Who has been stuck in Screening for more than a week?` | `{ currentStage: "SCREENING", currentStageDuration: { operator: ">", durationDays: 7 } }` |
| `sharam` | `{ name: { query: "sharam" } }` |
| `Who moved to Interview since Monday?` | `{ movedToStage: { stage: "INTERVIEW", since: <last Monday, 00:00> } }` |
| `Who reached the Offer stage but didn't get hired?` | `{ reachedStageNotHired: "OFFER" }` |
| `Everyone except rejected candidates` | `{ excludeStages: ["REJECTED"] }` |
| `Priya in Screening for more than 7 days` | `{ name: { query: "Priya" }, currentStage: "SCREENING", currentStageDuration: { operator: ">", durationDays: 7 } }` |

### How filters run

Everything except the name becomes a Prisma `where` (an `AND` of conditions). *Time in stage* filters on
`Candidate.updatedAt` (see [Data Model](#data-model)); *moved to / reached* is a relation filter on
`StageHistory`; *reached but not hired* means "has a history row into that stage **and** is not currently
Hired" — it includes people still sitting in that stage as well as those rejected out of it.

### Fuzzy name ranking

Names are matched with PostgreSQL's `pg_trgm` extension and ordered by **tier first, similarity second, name third**:

| Tier | Rule | Example for `mehta` |
| --- | --- | --- |
| 3 — exact | name equals the query (case-insensitive) | `Mehta` |
| 2 — prefix | name starts with the query | `Mehtani Rao` |
| 1 — strong fuzzy | `word_similarity ≥ 0.45` | `Rahul Mehta`, `Rahul Mehra` |
| 0 — weak fuzzy | `0.30 ≤ word_similarity < 0.45` | `Amit Menta` |
| dropped | `word_similarity < 0.30` | `Nita Rao` |

Tier beats score: a prefix match (`Mehtani Rao`, raw score 0.83) ranks above a whole-word match with a higher raw
score (`Rahul Mehta`, 1.0). `word_similarity()` rather than `similarity()` is deliberate: it scores the best-matching
*part* of a name, so the typo `sharam` scores 0.57 against `Priya Sharma` instead of being diluted to 0.25 by the
unrelated "Priya ". The 0.45/0.30 thresholds were calibrated against real data, not guessed: at 0.15, `priya` also
matched `Ananya Iyer` and `Divya Menon`; 0.30 removes that noise while keeping every genuine typo tried.
Each result carries a `matchType` — `exact`, `prefix`, `word` or `fuzzy` — which the UI shows ("Fuzzy name match").

### When a query can't be understood

- The parser rejects an empty query, or one that is only filler (`who is the`), and gives specific reasons where
  it can (`"Bananas" is not a valid stage`, or a `since` phrase it can't read).
- Unrecognised words are read as a **name** — that is what lets `sharam` work. So `purple elephants` parses as a
  name search that finds nobody. The UI treats "only a name was understood, and nobody has it" as *"I couldn't
  understand that search"*, says what it tried, and lists what can be searched (with examples). A search that
  *did* understand filters but found nobody gets a different panel that lists those filters instead.

### In the UI

Typing searches 400 ms after the last keystroke (Enter searches immediately); an empty box returns to the board
without a request; a newer search cancels the older one; a search still running after 3 s says so, and one that
hasn't answered after 15 s is abandoned with a retry. Results show the count, the filters applied
(e.g. `Current stage = Screening` · `More than 7 days in current stage`), and a per-result match reason.

---

## API

Base URL `http://localhost:4000`. All bodies are JSON. There is deliberately **no** `PUT`, `PATCH` or `DELETE`
anywhere — such requests return `404`.

| Method | Path | Purpose | Success | Errors |
| --- | --- | --- | :-: | --- |
| `GET` | `/health` | Liveness check | 200 | — |
| `POST` | `/api/candidates` | Create a candidate (always starts in `APPLIED`) | 201 | 400, 409 |
| `GET` | `/api/candidates` | List candidates; optional `?stage=SCREENING` | 200 | 400 |
| `GET` | `/api/candidates/:id` | One candidate, with time in current stage | 200 | 404 |
| `GET` | `/api/candidates/:id/history` | Audit trail, oldest first (read-only) | 200 | 404 |
| `POST` | `/api/candidates/:id/transition` | Move to `{ "toStage": "…" }` | 200 | 400, 404, 409 |
| `POST` | `/api/candidates/:id/reject` | Move to `REJECTED` | 200 | 404, 409 |
| `GET` | `/api/search?q=…` | Natural-language search | 200 | 400 |

### The candidate object

```json
{
  "id": "cmulcgvgo0000znjpdv7tws77",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": null,
  "currentStage": "APPLIED",
  "createdAt": "2026-09-28T14:30:12.552Z",
  "updatedAt": "2026-09-28T14:30:12.552Z",
  "currentStageSince": "2026-09-28T14:30:12.552Z",
  "daysInCurrentStage": 0
}
```

`currentStageSince` is when the candidate entered their stage; `daysInCurrentStage` is computed at response time
(whole days) and never stored.

### Examples

```bash
# Create → 201
curl -X POST localhost:4000/api/candidates -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'

# Skip a stage → 409
curl -X POST localhost:4000/api/candidates/$ID/transition -H 'Content-Type: application/json' \
  -d '{"toStage":"INTERVIEW"}'
# {"error":"Cannot skip stages: APPLIED must move to SCREENING before INTERVIEW.","from":"APPLIED","to":"INTERVIEW"}

# Valid move → 200 (returns the updated candidate)
curl -X POST localhost:4000/api/candidates/$ID/transition -H 'Content-Type: application/json' \
  -d '{"toStage":"SCREENING"}'

# History → 200
curl localhost:4000/api/candidates/$ID/history
# [{"id":"…","fromStage":"APPLIED","toStage":"SCREENING","changedAt":"2026-09-28T14:30:12.598Z"}]

# Reject twice → 200, then 409
curl -X POST localhost:4000/api/candidates/$ID/reject
# {"error":"Rejected is a final stage and cannot be changed.","from":"REJECTED","to":"REJECTED"}

# Search
curl -G localhost:4000/api/search --data-urlencode "q=sharam"
```

Search success (`matchType` and `score` are `null` when the query has no name part):

```json
{
  "success": true,
  "query": "sharam",
  "parsedQuery": { "name": { "query": "sharam" } },
  "results": [
    { "id": "…", "name": "Priya Sharma", "currentStage": "APPLIED",
      "currentStageSince": "…", "daysInCurrentStage": 2, "score": 0.5714286, "matchType": "fuzzy" }
  ]
}
```

A query the parser can't use returns **HTTP 200** (the request was fine; the sentence wasn't):

```json
{ "success": false, "query": "who is the", "message": "I couldn't understand this search.",
  "supportedFilters": ["candidate name (exact, prefix, or fuzzy/typo match)", "current stage", "…"], "results": [] }
```

### Errors

Every error is JSON with an `error` message. The status code says what kind:

| Status | Meaning | Body |
| :-: | --- | --- |
| **400** | Malformed request: failed validation, bad JSON, missing `q` | `{"error":"Validation failed","details":[{"path":"email","message":"email must be a valid email address"}]}` |
| **404** | Candidate doesn't exist, or the route doesn't | `{"error":"Candidate nope not found"}` |
| **409** | A well-formed request that conflicts with current state: an invalid transition, or a duplicate email | `{"error":"…","from":"…","to":"…"}` / `{"error":"A candidate with email ada@example.com already exists"}` |
| **500** | Unexpected; logged server-side, never leaks internals | `{"error":"Internal server error"}` |

**400 vs 409:** `{"toStage":"INTERVIEW"}` is perfectly valid JSON naming a real stage — what's wrong is that it
conflicts with the candidate's *current* stage. That is what `409 Conflict` means, and it lets a client tell
"fix your request" (400) from "that isn't allowed right now" (409) without parsing the message.

---

## Running Locally

**Prerequisites:** Node.js 20+, npm 10+, PostgreSQL running locally (developed on 14). The database user must be
able to `CREATE EXTENSION pg_trgm` — it is a *trusted* extension since PostgreSQL 13, so a database owner can, and a
superuser certainly can. On some Linux distributions `pg_trgm` ships in the `postgresql-contrib` package.

From the repository root:

```bash
# 1. Install everything (root, backend and frontend workspaces)
npm install

# 2. Configure the environment (defaults assume user postgres / password postgres on localhost:5432)
cp .env.example .env

# 3. Create two databases: one for development, one for the test suite
#    (psql asks for the password — "postgres" with the defaults)
psql -U postgres -h localhost -c 'CREATE DATABASE mini_hiring_pipeline;'
psql -U postgres -h localhost -c 'CREATE DATABASE mini_hiring_pipeline_test;'

# 4. Generate the Prisma client and apply the migrations to the dev database
npm run prisma:generate
npx prisma migrate deploy --schema=prisma/schema.prisma

# 5. Seed 12 realistic candidates spread across every stage
npm run db:seed

# 6. (Only needed to run the backend tests) migrate the test database too
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mini_hiring_pipeline_test?schema=public" \
  npx prisma migrate deploy --schema=prisma/schema.prisma

# 7. Run the app — two terminals
npm run dev:backend      # API      → http://localhost:4000   (GET /health to check)
npm run dev:frontend     # Frontend → http://localhost:5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/health` to the backend, so no CORS setup is needed.

Notes:

- **`db:seed` erases data.** It `TRUNCATE`s `Candidate` and `StageHistory` in whichever database `DATABASE_URL`
  points to, so it is safe to re-run to reset the demo, and unsafe to point at data you care about.
- Use **`migrate deploy`** to set up a database. `npm run prisma:migrate` (`migrate dev`) is for *authoring* new
  migrations and needs a shadow database; during development it hung once in one environment while cleaning that
  up, whereas `deploy` is non-interactive and did not.
- **Different Postgres credentials?** Edit `DATABASE_URL` in `.env`, and the test database URL in
  `backend/tests/setup.ts` (it is deliberately hard-coded there so tests can never touch the dev database).
- **Production build:** `npm run build:backend && npm run build:frontend`; `npm start --workspace=backend` runs the
  compiled API. The backend does **not** serve the built frontend and there is no Docker or deployment
  configuration — see [Trade-offs](#trade-offs).

Other scripts: `npm run prisma:studio` (browse the data), `npm run build:backend`, `npm run build:frontend`.

---

## Environment Variables

Defined in [`.env.example`](.env.example) — copy it to `.env` at the repository root (git-ignored).

| Variable | Example | Used by | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/mini_hiring_pipeline?schema=public` | Prisma (API, seed, migrations) | PostgreSQL connection string |
| `PORT` | `4000` | Backend | HTTP port (falls back to `4000`) |
| `NODE_ENV` | `development` | Backend | Read into config, but currently changes no behaviour |

How they are loaded, and a few gotchas:

- The backend loads the **root** `.env` (`backend/src/config/env.ts`), and the Prisma CLI reads it from the root as well.
  A variable already set in the shell **wins** over `.env` — the seed script and the test setup rely on that.
- The **frontend has no environment variables.** The dev proxy target (`http://localhost:4000`) is written in
  `frontend/vite.config.ts`; if you change `PORT`, change it there too.
- The **test database URL is not an env var**: it is set in `backend/tests/setup.ts`.

---

## Testing

```bash
npm test                 # backend, then frontend
npm run test:backend     # needs the test database (setup step 6 above)
npm run test:frontend    # needs no database

# a single file, or a name filter
npx --workspace=backend  vitest run tests/api/search.test.ts
npx --workspace=frontend vitest run src/SearchExperience.test.tsx
npx --workspace=frontend vitest run -t "purple elephants"
```

**431 tests** — 238 backend (9 files), 193 frontend (8 files):

| Area | What it covers |
| --- | --- |
| Transition rules (pure) | Every valid/invalid move; skip, backwards, no-op, finality; `Hired → Rejected` |
| Transition service (real DB) | History written for every valid move and never for a failed one; the update and the history insert roll back together; **concurrent requests** never corrupt the trail |
| Candidate + search API (Supertest, real DB) | Every endpoint and status code; validation; duplicates; read-only history; ranking tiers, `matchType`, fuzzy matching, every example query |
| Query parser (pure, 100 cases) | Every grammar phrase, synonyms, comparators, date phrases, contractions, combinations, failure messages, determinism |
| Frontend hooks and domain | Never sends an invalid move; refetch after a `409`; in-flight guard; timeline ordering; "3 days 7 hours" arithmetic; empty history |
| Frontend app (Testing Library) | Board, move, reject (confirm/cancel/busy/failure), add-candidate, details drawer, and the whole search experience — debounce, slow network, timeout, cancellation, backend failure |

How the tests are built, and why to trust them:

- **Backend tests use a real PostgreSQL**, not mocks — so the append-only trigger, the `CHECK` constraint,
  transaction rollback, row locking and `pg_trgm` are actually exercised. A second database keeps the suite
  from touching your dev data; files run serially (`fileParallelism: false`) because they share it.
- **Frontend search tests replay real backend responses**, captured into `frontend/src/test/realSearchResponses.ts`,
  so they test the actual contract rather than one invented in the test. Timezone is pinned to UTC for date assertions.
- **Regression tests were made to fail first.** For example, the concurrency tests were run against the pre-fix
  code and failed, then passed after the fix.
- **Mutation checks** (done by hand while building): deliberately breaking a behaviour — the operator mapping,
  the ranking tiers, the debounce, the timeout, the dismissal guard — and confirming a test fails. One
  surviving mutation (a redundant stale-response guard) revealed an untested path and got its own test.
- **Not automated:** browser-level checks (real Chromium, real keystrokes, screenshots at 1440/820/390px) were
  run against the live backend during development but are **not committed as an e2e suite**, and there is no CI.

---

## Design Decisions

### 1. Why PostgreSQL

The domain is small but its guarantees are *relational*: a history row must reference a real candidate, must
record a real change, and must never change afterwards; a stage change and its history row must commit together.
PostgreSQL provides all of it natively — foreign keys, `CHECK` constraints, triggers, transactions, `SELECT … FOR
UPDATE`, enums — so those rules live next to the data instead of being re-implemented (and forgotten) in
application code. It also has `pg_trgm`, which gives typo-tolerant name search **inside the same database**, with
an index, and no second system to run and keep in sync. Alternatives considered: SQLite (no trigram search or row
locks), a document store (weaker constraints, and the audit guarantees would move into application code), and a
search engine like Elasticsearch (real operational weight for a corpus of one job's candidates).

### 2. Why Prisma

A typed client and versioned migrations for the 95% that is ordinary CRUD, with a schema file that documents the
model. The honest costs: Prisma cannot express triggers, `CHECK` constraints, extensions, row locks or trigram
queries, so those are **raw SQL** — in migrations, and via `$queryRaw` for the row lock and the ranking query
(parameterised through the tagged template, so no injection surface). I judged that better than dropping to a
query builder everywhere for the sake of a few statements. Prisma is **pinned to 5.x**: the newest majors
changed client generation and I preferred a version I could vouch for over the latest.

### 3. Why deterministic search instead of an LLM

- **Predictable:** the same query always yields the same filters and the same order. A recruiter should never see
  results shift because a model read a phrase differently today.
- **Testable:** the parser is pure; 100 unit tests pin its behaviour. An LLM's output can't be pinned like that.
- **Explainable:** the UI shows the filters that were applied, because they are exactly what ran.
- **Fast, free, offline** — and candidate names and emails never leave the system.
- The vocabulary is small and fixed, so a grammar is a good fit. **The cost is real:** phrasing outside the
  grammar isn't understood where a model would guess (see [Trade-offs](#trade-offs)). If an LLM were added later
  it should sit *behind the same contract*: propose a `ParsedFilters` object that the existing, deterministic
  executor validates and runs, and only as a fallback when the parser fails.

### 4. Why immutable history

An audit trail that can be edited isn't one. Recruiters, and anyone investigating a hiring decision, need to
trust that the recorded sequence is what happened. So immutability is enforced where it can't be bypassed by
accident — in the database (triggers, `CHECK`, `RESTRICT`), with the API's lack of an edit route as a second layer
rather than the only one. Timestamps come from the server for the same reason: the service accepts none from a
caller, so no client can backdate an entry. (Seed data legitimately needs history from weeks ago, so `prisma/seed.ts`
writes directly through Prisma while validating every hop against the same `validateTransition` rules.)

### 5. Why server-side transition validation

Frontend restrictions are UX, not security or correctness: a second tab, a stale board, another recruiter or a
hand-written `curl` all bypass them. So `validateTransition` runs in the service on **every** request, inside
the transaction, and the UI is built to assume it can be wrong: it shows the server's own message on a `409`
and silently refetches so the board corrects itself. The client keeps a small mirror of the rules
(`domain/stages.ts`) purely to decide which buttons to offer — duplicated on purpose, a few lines, with the server
as the only authority. (Sharing the rules through a package was considered and rejected as more build machinery
than a six-entry table justifies.)

### 6. Why transactions — and why they weren't enough

Updating `currentStage` and inserting the history row must both happen or neither: otherwise a crash between
them leaves a candidate in a stage with no record of how they got there, permanently corrupting the trail. Both
writes are one `prisma.$transaction`, and a test forces the second write to fail and checks the first rolled back.

**But a transaction alone turned out not to be enough**, and I found that the hard way. Atomicity doesn't stop two
requests validating against the *same stale read*. A stress test fired a "move to Screening" and a "reject" at
one candidate simultaneously: in 39 of 40 trials both returned `200`, the trail contained both `APPLIED→REJECTED`
and `APPLIED→SCREENING`, and a **rejected candidate ended up in Screening** — violating both "Rejected is final"
and a trustworthy history. The fix is to lock the candidate row (`SELECT … FOR UPDATE`) at the start of the
transaction: the second request waits, then reads what the first committed and is judged against the *true*
state, so it gets the correct `409`. After the fix, the same test produced 0 of 40, and the concurrency tests now
guard it. I chose a lock over optimistic compare-and-set because the loser then gets the accurate domain error
rather than a generic "try again".

### Other decisions

- **Pessimistic UI updates.** A card moves only after the server confirms. Optimistic UI would feel snappier, but
  the server can refuse any move, and showing then un-showing a state is worse than a short spinner in a tool
  whose whole point is "who is in which stage".
- **409 vs 400** for a valid request that conflicts with state (above), and **duplicate email as 409** for the same reason.
- **Time in stage from timestamps, not a stored counter.** Durations change every minute; a stored value is stale
  the instant it's written. The details drawer computes it as *now − the latest transition's timestamp* from the
  audit trail, not from the candidate's own field or the board's copy.
- **`matchType` computed by the backend**, not re-derived in the UI — the SQL already knows the tier, and a second
  implementation would drift.
- **Express 5**: async handlers' errors reach the error middleware without try/catch in every controller.
- **`zod`** for request validation: consistent field-level errors, and schemas double as TypeScript types.
- **No state library, router or UI kit.** One server-backed list and a handful of flags fit `useState` plus one
  hook; the app is one screen plus dialogs. The native `<dialog>` element supplies focus trapping, Escape and
  top-layer stacking without a dependency.
- **Monorepo with npm workspaces** — shared install and per-package scripts with zero extra tooling.

---

## Trade-offs

Limitations I know about, most of which I confirmed by testing rather than assuming:

**Correctness and data**
- **Emails are case-sensitive.** `ada@example.com` and `ADA@example.com` are treated as different candidates
  (verified). Emails should be normalised, or uniqueness enforced on `lower(email)`.
- **`updatedAt` doubles as stage-entry time.** It holds only while a candidate row is written solely at creation and
  on transitions. If an "edit candidate" feature is ever added, it would silently reset every affected
  candidate's time-in-stage. A dedicated `stageEnteredAt` column (or deriving from history) would remove the coupling.
- **`currentStage` is denormalised** from history; the transaction and row lock keep them in agreement, but the
  database itself doesn't enforce it.
- **Audit protection has limits** (see [Immutable Audit Trail](#immutable-audit-trail)): owners/superusers can drop
  triggers or `TRUNCATE`; no tamper-evidence; no actor recorded.
- The triggers, `CHECK` and `pg_trgm` exist only in SQL migrations — `schema.prisma` alone is not a complete description.

**Search**
- **The grammar is small and English-only.** No number words other than "a"/"an" (`two weeks`), no `last week`,
  `next Tuesday`, no OR, no negating a name. Unsupported phrasing is reported, not guessed at.
- **Unrecognised text becomes a name search.** So gibberish and a genuinely absent name look identical to the
  parser; the UI's wording is careful about that, but it is a heuristic. A name containing a filler word
  (`An Nguyen`) loses it before matching (trigram matching still finds them).
- **Relative dates use the server's timezone**, not the recruiter's: "since Monday" means Monday 00:00 *server*
  time. Fine for one team in one place; wrong across timezones.
- **Ranking thresholds were tuned on 12 seed rows.** They should be revisited against real data.

**Scale and behaviour**
- **No pagination.** `GET /api/candidates` and search return everything, and the UI renders everything.
  Comfortable for one job's candidates, not for thousands.
- **Durations use the browser's clock**, against server timestamps; a device clock that is minutes off skews
  "3 days 7 hours" by that much (a future timestamp is clamped to "less than a minute").
- **The details drawer makes two requests** (candidate + history) and re-fetches on an inconsistent pair,
  rather than using a single combined endpoint.
- Transitions for the same candidate are **serialised** by the row lock — correct, and irrelevant at this scale.

**Scope and operations**
- **No authentication or authorisation** — deliberate: the brief is one recruiter and one job. Anyone who can reach
  the API can do everything.
- **No deployment story.** The Vite proxy is dev-only, the backend doesn't serve the built frontend, and there is
  no Docker, CI, CORS configuration, rate limiting or structured logging.
- **No committed end-to-end tests**, and no cross-browser or screen-reader testing (browser checks were manual, in
  headless Chromium).
- `NODE_ENV` is read but unused; the test database URL is hard-coded in the test setup.

---

## What I'd Do With More Time

Roughly in the order I'd do them:

1. **Fix the small correctness gaps** — case-insensitive email uniqueness (`citext` or a `lower(email)` unique
   index), a `stageEnteredAt` column so time-in-stage stops depending on `updatedAt`, and a single
   `GET /candidates/:id/details` so the drawer can't see a torn snapshot.
2. **Authentication and authorisation.** Users and roles; every request tied to an identity; the database
   connection using a role that cannot alter triggers or truncate tables.
3. **Audit actor information.** Add `changedBy` (and optionally a reason and source: UI / API / import) to
   `StageHistory`, populated from the authenticated user, so the trail answers *who*, not only *what* and *when*.
   Optionally make it tamper-evident with a per-row hash chain.
4. **Pagination.** Cursor-based for the candidate list, and a result limit for search; virtualise long columns in the UI.
5. **Better query grammar.** Number words, `last week` / `next Tuesday`, OR, `not`, ranges, per-user timezone for
   dates; move from a regex pipeline to a small tokenizer + grammar once the vocabulary outgrows it, and log
   *unparsed* queries to see what recruiters actually type. (An LLM could then be an optional fallback that emits
   the same structured filters — never the executor.)
6. **Richer search ranking.** Combine trigram similarity with token order, exact-token boosts and recency; rank
   non-name queries (currently just pipeline order); re-calibrate thresholds on real data; consider
   `unaccent` for non-English names.
7. **Database indexes.** Profile with `EXPLAIN` on realistic volumes. Likely: `StageHistory(toStage, changedAt)`
   for the "moved to X since…" and "reached X" filters, and a composite on `Candidate(currentStage, updatedAt)` for
   "stuck in X for more than…". Today only `currentStage`, `email`, the trigram name index and `candidateId` are indexed.
8. **Observability.** Structured logs with request ids, metrics (latency, error rates, transition counts), tracing,
   and health/readiness checks that verify the database.
9. **Accessibility.** Test with real screen readers; keyboard alternatives for board actions; a contrast audit;
   focus management review for the drawer and dialogs; announce search result counts more deliberately.
10. **Production deployment.** Dockerfile(s), CI running both suites plus a committed Playwright e2e suite, serving
    the built frontend, environment-specific config, migrations as a release step, HTTPS, CORS, rate limiting.
11. **Background analytics.** Funnel conversion, average time per stage and "stuck" reports, from the audit trail
    (materialised views or a scheduled job) so they don't slow the interactive path.

---

## AI Usage

I built this with **Claude Code** (Anthropic's AI coding agent, running in my editor). It is fair to say the AI wrote
the large majority of the code, tests and documentation — and equally fair to say it did not simply build
"the app": the work was steered, gated and checked, and the parts that matter most were specified by me.

**How the work was run.** In phases, each starting from a written brief of mine with an explicit scope and a
"do not proceed to the next phase" gate: foundation → data model and audit trail → candidate API → search engine
→ recruiter UI → candidate details → search experience → this documentation. The agent stopped at the end of each
phase and continued only when I sent the next brief.

**What came from me** (in the briefs, not the AI): the stack; the pipeline rules; that history must be append-only
and every transition transactional; that the backend, not the UI, is the source of truth; that search must be
deterministic and **not** use an LLM; the UX requirements (loading, error and empty states, confirmation on reject,
the "3 days 7 hours" wording, the exact example queries); and what to leave out of each phase.

**What the AI did:** scaffolding; the implementation; the tests; running the tests, builds and linters; the manual
verification described below; and drafting this documentation. It also made many small design decisions inside those
constraints (for example, adding a `matchType` field so the UI could explain matches, pinning dependency majors,
using the native `<dialog>`), which are recorded with their reasoning in [`docs/build-notes.md`](docs/build-notes.md).

**How the output was checked.** Rather than trust it, the agent was asked to prove things: tests were run against a
real database; regression tests were written to fail before a fix; behaviours were deliberately broken (mutation
checks) to confirm a test noticed; and the UI was driven in a real headless Chromium against the live backend,
including timing-sensitive cases. That process caught real mistakes made by the AI itself, for example:

- **A concurrency bug in its own Phase 2 design** — found while writing this README's audit-trail section. A stress
  test showed 39 of 40 simultaneous requests corrupting the audit trail, including a rejected candidate being moved
  forward. The fix is described under [Why transactions](#6-why-transactions--and-why-they-werent-enough).
- **A test that passed without testing anything** — an "Escape is ignored while saving" test, which jsdom can never
  trigger. It was found only because deliberately breaking that guard did not fail the test.
- **A guard with no test** — the stale-search-response guard survived a mutation because request cancellation already
  covered it; a test with a transport that ignores cancellation now exercises it.
- **A first-draft assumption about defaults** — the initial install pulled TypeScript 7 and Prisma 7; it was corrected
  to stable majors after considering compatibility risk.
- **Wrong numbers in its own checks** — several expected counts and durations in test scripts were the AI's arithmetic
  errors, not app bugs; the app's output was verified against an independent calculation each time.
- **A documented command that didn't work** — a draft of the audit-trail demo above used `psql "$DATABASE_URL"`, which
  fails on Prisma's `?schema=` suffix; it was caught by running the command before publishing it.

**What I can and can't vouch for.** Everything above ran in this repository and can be re-run with `npm test`. What
has *not* been done: a human review of every line, cross-browser testing, screen-reader testing, load testing, or a
security review beyond parameterised queries and server-side validation. Treat it as well-tested, not audited.

### Chat logs and where I disagreed with the AI

> **To complete before submitting** — this part must come from me, not from the AI, so it is deliberately not
> filled in: (1) commit the AI chat logs under `docs/` and link them here; (2) document **one real example where I
> disagreed with the AI and why** — what it proposed, what I chose instead, and the reasoning.
