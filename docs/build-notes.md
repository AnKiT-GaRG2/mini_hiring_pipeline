# Build notes (per-phase log)

> The detailed, phase-by-phase notes kept while building this project: what each phase added,
> the decisions made along the way, and the test/verification detail. The top-level
> [README](../README.md) is the up-to-date overview; read this when you want the longer history
> behind a decision. Numbers and paths here reflect the project as of the end of Phase 7.
>
> **Correction (Phase 9).** The Phase 2 sections below describe the transaction as what keeps the audit
> trail consistent. That was incomplete: a stress test found that two simultaneous requests for the same
> candidate could both pass validation against the same stale read (39 of 40 trials corrupted the trail,
> including a rejected candidate being moved forward). The transition service now locks the candidate row
> (`SELECT … FOR UPDATE`) first, and concurrency tests guard it. See the README's
> "Why transactions — and why they weren't enough". Test counts below are from before that fix
> (backend is now 238 tests).

# Mini Hiring Pipeline

A recruiter tool for managing candidates through a single hiring pipeline
(Applied → Screening → Interview → Offer → Hired), with an audit trail of
every stage transition and a natural-language search box over candidates.

This project is being built in phases.

- **Phase 1 (project foundation):** repo scaffolding, backend/frontend
  skeletons, a health check.
- **Phase 2 (database model and immutable audit trail):** the
  Candidate/StageHistory schema, a transactional transition service that
  enforces every stage-progression rule, database-level append-only
  enforcement, seed data, and tests.
- **Phase 3 (candidate API):** REST endpoints for creating, listing,
  viewing, and transitioning candidates, request validation, proper HTTP
  status codes, and integration tests for every endpoint.
- **Phase 4 (search engine):** `GET /api/search?q=`, a deterministic
  natural-language query parser, PostgreSQL trigram fuzzy name matching,
  tiered ranking, and explanations for queries it can't resolve.
- **Phase 5 (recruiter UI):** the pipeline board, add-candidate form,
  move/reject with confirmation and loading/error handling, and a basic search
  box wired to the search API.
- **Phase 6 (candidate details and audit trail UI):** a read-only drawer with
  the candidate's details, "Currently in X for 3 days 7 hours", and a
  chronological history timeline, all from server timestamps.
- **Phase 7 (search experience) — complete:** debounced global search, a ranked
  results view with the filters applied and why each name matched, and explicit
  handling of empty, no-result, unparseable, failed and slow searches.

## Architecture

```
/
  backend/     Express + TypeScript API
    src/
      routes/        candidate.routes.ts, health.routes.ts — path -> controller only
      controllers/   candidate.controller.ts (thin HTTP handlers), candidate.presenter.ts (response shaping)
      services/      candidate.service.ts (create/list/get/transition), search.service.ts (filters -> SQL + ranking)
      domain/        stageTransitions.ts (pure rules), errors.ts (typed domain errors)
      validation/    candidate.validation.ts — zod schemas for request bodies/queries
      search/        queryParser.ts (NL query -> filters), stageWords.ts, dateWords.ts, describeFilters.ts — pure, no I/O
      middleware/    errorHandler.ts — maps thrown errors to HTTP status + JSON body
      db/            prisma.ts — PrismaClient singleton
      config/        Environment variable loading
      app.ts         Express app (exported, unstarted — used directly in tests)
      index.ts       Entry point: starts the HTTP server
    tests/
      domain/            Pure unit tests for transition rules
      controllers/       Pure unit tests for response/duration shaping
      services/          Integration tests against a real Postgres test DB
      api/               Supertest integration tests for every HTTP endpoint (candidates + search)
      search/            Parser, date-phrase, and interpretation-summary unit tests
      helpers/db.ts       Test-only reset helper (TRUNCATE)
  frontend/    React + TypeScript + Vite + Tailwind CSS (see "Recruiter UI" for the component tree)
    src/api, src/domain, src/hooks, src/components, src/test
  prisma/
    schema.prisma  Candidate, StageHistory, Stage enum
    migrations/    SQL migrations, including the append-only trigger
    seed.ts        Seeds 12 candidates spread across every stage
  docs/        Project documentation deliverables (added in a later phase)
```

**Why this layered backend structure:** routes stay thin (just wiring),
controllers only translate HTTP <-> domain calls, and business logic/data
access are isolated in `services`/`db`. `domain/stageTransitions.ts` has zero
I/O — it's a pure function from `(currentStage, targetStage)` to a validation
result, so the entire rule set (skip/backwards/final-stage checks) is
unit-tested without a database. `candidate.service.ts` is the only thing that
touches Prisma for candidates, and is where the transaction lives.

**Why `app.ts` is separate from `index.ts`:** Supertest needs an Express app
instance it can call directly without binding a real port. Exporting the app
from `app.ts` and only calling `.listen()` in `index.ts` keeps tests fast and
avoids port conflicts in CI.

## Data model & business rules (Phase 2)

**Schema** (`prisma/schema.prisma`):

- `Stage` enum: `APPLIED | SCREENING | INTERVIEW | OFFER | HIRED | REJECTED`.
- `Candidate`: `id, name, email (unique), phone?, currentStage (default Applied), createdAt, updatedAt`.
- `StageHistory`: `id, candidateId (FK, RESTRICT on delete), fromStage, toStage, changedAt`.
  `fromStage`/`toStage` are both required — a row only ever represents an
  actual transition. A candidate's initial "Applied" state comes from
  `Candidate.createdAt`, not a history row, since creation isn't a
  transition.

**Transition rules** (`backend/src/domain/stageTransitions.ts`):

```
APPLIED   -> SCREENING | REJECTED
SCREENING -> INTERVIEW | REJECTED
INTERVIEW -> OFFER     | REJECTED
OFFER     -> HIRED     | REJECTED
HIRED     -> (none — final)
REJECTED  -> (none — final)
```

Forward moves are checked against a fixed step order (`APPLIED, SCREENING,
INTERVIEW, OFFER, HIRED`), so skipping (`APPLIED -> INTERVIEW`) and moving
backwards (`INTERVIEW -> SCREENING`) are both rejected with distinct,
readable error messages. `HIRED` and `REJECTED` are checked first and reject
*any* further move — this single rule also covers `HIRED -> REJECTED`
without a special case, since "Hired is final" already forbids every
transition away from it.

**Why history is immutable:** an audit trail that can be edited after the
fact isn't an audit trail — a recruiter (or an incident investigation) needs
to trust that the recorded sequence of stage changes is exactly what
happened. This is enforced twice, deliberately redundant:

1. **Application layer:** there is no service function, and will be no
   route, that updates or deletes a `StageHistory` row — the only write path
   is `transitionCandidateStage`'s `create` call.
2. **Database layer:** a `BEFORE UPDATE OR DELETE` trigger on `StageHistory`
   raises an exception unconditionally (see the migration's `migration.sql`).
   This means even a future bug, a direct `psql` session, or a careless
   script can't quietly rewrite history — only `TRUNCATE` (used solely by
   the seed script and test reset helper, and clearly commented as a
   deliberate exception) bypasses it.

A `CHECK` constraint (`fromStage IS DISTINCT FROM toStage`) also blocks any
row that doesn't represent a real change, as a second line of defense behind
the application-level no-op check.

**Why transactions are required:** step 3 (update `Candidate.currentStage`)
and step 4 (insert the `StageHistory` row) must both happen or neither must.
If the candidate update succeeded but the history insert failed (a crash, a
lost connection), the candidate would silently be in a stage with no record
of how it got there — permanently corrupting the audit trail. Wrapping both
writes in one `prisma.$transaction(async (tx) => { ... })` call means a
failure at either step rolls back both. This is verified directly in
`tests/services/candidateTransition.test.ts`, which forces the second write
to fail (via the check constraint above) *inside* the same transaction
pattern the service uses, and confirms the first write was rolled back.

The transition service also never accepts a timestamp from its caller —
`changedAt` is always `new Date()`, taken server-side. This matters because
once an HTTP route exists on top of this service, nothing in the request
body could be used to backdate audit history. Seed data legitimately needs
historical timestamps, so `prisma/seed.ts` writes directly via Prisma
(inside its own transaction) instead of going through the service, while
still validating every hop against the same `validateTransition` rules.

## Candidate API (Phase 3)

Base URL: `http://localhost:4000/api/candidates`. All bodies are JSON.

| Method | Path                       | Purpose                                   |
| ------ | -------------------------- | ------------------------------------------ |
| POST   | `/`                        | Create a candidate (always starts Applied) |
| GET    | `/`                        | List candidates, optionally `?stage=`      |
| GET    | `/:id`                     | Get one candidate + time in current stage  |
| GET    | `/:id/history`             | Full chronological stage history           |
| POST   | `/:id/transition`          | Move to a target stage (validated)         |
| POST   | `/:id/reject`              | Shortcut for transitioning to Rejected     |

### Examples

Create a candidate:

```bash
curl -X POST http://localhost:4000/api/candidates \
  -H 'Content-Type: application/json' \
  -d '{"name":"Priya Sharma","email":"priya@example.com","phone":"+91-90000-00000"}'
```

```json
{
  "id": "cmuk3b0qq0000kkgbmw1eill8",
  "name": "Priya Sharma",
  "email": "priya@example.com",
  "phone": "+91-90000-00000",
  "currentStage": "APPLIED",
  "createdAt": "2026-09-27T17:25:56.737Z",
  "updatedAt": "2026-09-27T17:25:56.737Z",
  "currentStageSince": "2026-09-27T17:25:56.737Z",
  "daysInCurrentStage": 0
}
```

List candidates in Screening:

```bash
curl "http://localhost:4000/api/candidates?stage=SCREENING"
```

Move a candidate forward:

```bash
curl -X POST http://localhost:4000/api/candidates/$ID/transition \
  -H 'Content-Type: application/json' -d '{"toStage":"SCREENING"}'
```

Attempt an invalid transition (skipping a stage):

```bash
curl -X POST http://localhost:4000/api/candidates/$ID/transition \
  -H 'Content-Type: application/json' -d '{"toStage":"INTERVIEW"}'
# 409 Conflict
# {"error":"Cannot skip stages: APPLIED must move to SCREENING before INTERVIEW.","from":"APPLIED","to":"INTERVIEW"}
```

Reject a candidate:

```bash
curl -X POST http://localhost:4000/api/candidates/$ID/reject
```

View full history:

```bash
curl http://localhost:4000/api/candidates/$ID/history
```

```json
[
  { "id": "h1", "fromStage": "APPLIED", "toStage": "SCREENING", "changedAt": "2026-09-27T17:26:47.982Z" },
  { "id": "h2", "fromStage": "SCREENING", "toStage": "REJECTED", "changedAt": "2026-09-27T17:27:06.547Z" }
]
```

### Error responses

Every error is JSON with an `error` message and, where useful, extra
context. Status codes are chosen by what actually went wrong, not defaulted
to 400/500:

| Status | When                                              | Body shape                                              |
| ------ | ------------------------------------------------- | -------------------------------------------------------- |
| 400    | Request body/query fails validation (zod), or malformed JSON | `{ "error": "Validation failed", "details": [{ "path", "message" }] }` |
| 404    | Candidate id doesn't exist, or the route itself doesn't exist | `{ "error": "Candidate ... not found" }` / `{ "error": "Not found" }` |
| 409    | Transition violates a business rule (skip, backwards, final stage) | `{ "error": "...", "from": "...", "to": "..." }` |
| 409    | Duplicate email on create                         | `{ "error": "A candidate with email ... already exists" }` |
| 500    | Unexpected server error (logged, never leaks internals) | `{ "error": "Internal server error" }` |

**Why 409 for invalid transitions, not 400:** the request itself is
well-formed (a valid stage name) — what's wrong is that it conflicts with
the candidate's *current state*. 409 Conflict is the status code reserved
for exactly that: "the request is valid, but can't be applied given the
resource's current state." 400 is reserved for the request being malformed
(missing fields, wrong types), which is what the validation layer (zod)
already owns. Keeping these distinct means a client can tell "fix your
request" (400) apart from "this transition just isn't allowed right now"
(409) without parsing the message.

All controllers are plain `async` functions with no `try/catch` — Express 5
forwards a thrown error (or rejected promise) from a route handler straight
to `middleware/errorHandler.ts`, which is the single place that knows how to
turn a `CandidateNotFoundError`, `InvalidTransitionError`,
`DuplicateEmailError`, or `RequestValidationError` into the right status
code and body. This is also why "never trust frontend validation" holds:
`POST /:id/transition` always re-runs `validateTransition` server-side
inside the same transaction as the write — there is no code path where a
client-supplied stage skips that check.

## Search (Phase 4)

`GET /api/search?q=<query>` turns a recruiter's plain-English query into
structured filters, runs them, and returns ranked results. **There is no LLM
and no external API anywhere in the path** — parsing is a fixed pipeline of
regex extractors over a small vocabulary. That is a deliberate choice: the
same query always yields the same filters, every behaviour is unit-testable
(234 tests, none needing network), and a recruiter never sees results shift
because a model interpreted a phrase differently today.

### Pipeline

```
raw query
  -> normalise (expand "didn't"/"who's"..., strip ? ! . ,, collapse spaces)
  -> run extractors in order; each either consumes its phrase or does nothing
  -> whatever text is left, minus filler words, is a candidate-name query
  -> ParsedFilters  ->  search.service (Prisma filters + pg_trgm ranking)
```

The parser (`backend/src/search/`) is pure: `parseSearchQuery(query, now)`
takes the clock as an argument, so "since Monday" is testable without
freezing time.

### Query grammar

Phrases are case-insensitive and word order around them is free. `<Stage>` is
`Applied | Screening | Interview | Offer | Hired | Rejected` (plus a few
synonyms: *interviewing*, *screen*, *offered*, …).

| Concept | Phrase | Produces |
| --- | --- | --- |
| Name | `Find <name>`, `<name>`, or any leftover text | `name.query` |
| Current stage | `in <Stage>`, `<Stage> candidates`, `got/was hired`, `was rejected`, or a bare stage word | `currentStage` |
| Time in stage | `in <Stage> for [<cmp>] <N\|a\|an> <day(s)\|week(s)>` | `currentStage` + `currentStageDuration` |
| Stage movement | `moved to <Stage>`, `reached <Stage>` | `movedToStage` |
| Transition date | `… moved to <Stage> since <date>` | `movedToStage.since` |
| Hiring outcome | `reached <Stage> but didn't get hired`, `<Stage> candidates who were not hired` | `reachedStageNotHired` |
| Exclusion | `except / excluding / without <Stage> [candidates]` | `excludeStages` |
| Everything | `everyone`, `all candidates`, `list all candidates` | no filters |

Duration comparators: `more than`/`over` → `>`, `at least` → `>=`,
`less than`/`under` → `<`, `at most`/`no more than` → `<=`, `exactly` → `=`.
A bare `for 7 days` with no comparator reads as "at least 7 days" (`>=`).
`a week` = 7 days.

Dates after `since`: a weekday (`Monday` = the most recent Monday, today
included), `today`, `yesterday`, `N days ago`, or `YYYY-MM-DD` — all resolved
to local midnight.

Conditions combine with **AND**, in any mix: name + stage + duration,
name + exclusion, movement + exclusion, and so on.

### Parsed examples

Real output from the running endpoint (`parsedQuery` field):

| Query | Parsed |
| --- | --- |
| `Find Priya Sharma` | `{ name: { query: "Priya Sharma" } }` |
| `sharam` | `{ name: { query: "sharam" } }` |
| `Who's in Interview right now?` | `{ currentStage: "INTERVIEW" }` |
| `Who has been stuck in Screening for more than a week?` | `{ currentStage: "SCREENING", currentStageDuration: { operator: ">", durationDays: 7 } }` |
| `Who moved to Interview since Monday?` | `{ movedToStage: { stage: "INTERVIEW", since: "2026-09-20T18:30:00.000Z" } }` (Mon 2026-09-21 00:00 IST) |
| `Who reached the Offer stage but didn't get hired?` | `{ reachedStageNotHired: "OFFER" }` |
| `Offer candidates who were not hired` | `{ reachedStageNotHired: "OFFER" }` |
| `Everyone except rejected candidates` | `{ excludeStages: ["REJECTED"] }` |
| `Priya in Screening` | `{ name: { query: "Priya" }, currentStage: "SCREENING" }` |
| `Priya in Screening for more than 7 days` | `{ name: { query: "Priya" }, currentStage: "SCREENING", currentStageDuration: { operator: ">", durationDays: 7 } }` |

### How filters run

Everything except the name becomes a Prisma `where` (an `AND` of conditions):

- **Time in stage** uses `Candidate.updatedAt`, which by construction is the
  moment the candidate entered their current stage (see Phase 3).
  `> 7 days` means `updatedAt < now - 7d`.
- **Moved to / reached** is a relation filter on `StageHistory`
  (`toStage = X`, and `changedAt >= since` when a date is given).
- **Reached but not hired** is "has a `StageHistory` row into that stage
  **and** `currentStage != HIRED`" — so it includes people still sitting in
  that stage as well as those rejected out of it, and never the hired.

### Fuzzy name matching and ranking

Name matching uses PostgreSQL's `pg_trgm` extension (enabled by a migration,
with a GIN trigram index on `Candidate.name`). Results are ordered by tier
first, raw similarity second, name third:

| Tier | Rule | Example for `mehta` |
| --- | --- | --- |
| 3 — exact | `lower(name) = lower(query)` | `Mehta` |
| 2 — prefix | name starts with the query | `Mehtani Rao` |
| 1 — strong fuzzy | `word_similarity >= 0.45` | `Rahul Mehta` (1.0), `Rahul Mehra` (0.5) |
| 0 — weak fuzzy | `0.30 <= word_similarity < 0.45` | `Amit Menta` (0.33) |
| dropped | `word_similarity < 0.30` | `Nita Rao` (0.17) |

Tier beats score: in the test above `Mehtani Rao` (raw 0.83) ranks *above*
`Rahul Mehta` (raw 1.0) because a prefix match is a stronger signal than a
whole-word fuzzy hit.

**Why `word_similarity`, not `similarity`:** `similarity()` compares whole
strings, so `sharam` against `Priya Sharma` is diluted by the unrelated
`Priya ` and scores only 0.25. `word_similarity()` scores the best-matching
*substring*, giving 0.57 — which is what makes a misspelled surname find a
full name. **The 0.45 / 0.30 thresholds were calibrated against real data,
not guessed:** a 0.15 cut-off let `priya` match `Ananya Iyer` and `Divya
Menon` (0.167 each, coincidental letter overlap), and `vikran` pulled in
`Karan Malhotra` at 0.286; 0.30 excludes both while keeping every genuine
typo tried (`sharam` 0.57, `vikran` 0.71, `anaya iyer` 0.64, `mehmta` 0.44).

Without a name filter there's nothing to rank on, so results come back in
pipeline order (Applied → … → Rejected), then alphabetically, with
`score: null`.

### Response shapes

Success:

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

Success with no matches adds a `message` describing how the query was read,
so the recruiter can spot a misinterpretation rather than staring at `[]`:

```json
{ "success": true, "parsedQuery": { "name": { "query": "Bananas" } }, "results": [],
  "message": "No candidates matched. I interpreted your search as: name similar to \"Bananas\"." }
```

Not understood (HTTP 200 — the request was fine, the query wasn't):

```json
{
  "success": false,
  "query": "who is the",
  "message": "I couldn't understand this search.",
  "supportedFilters": ["candidate name (exact, prefix, or fuzzy/typo match)", "current stage",
    "time spent in current stage", "stage movement (e.g. moved to Interview)",
    "transition date (e.g. since Monday)", "hiring outcome (e.g. reached Offer but not hired)",
    "excluding a stage (e.g. everyone except rejected)"],
  "results": []
}
```

When the query is recognisably *about* something but one piece is wrong, the
message says exactly which piece:

- `moved to Bananas` → *I understood you're referring to a stage ("Bananas"), but that's not a valid stage. Valid stages are: Applied, Screening, Interview, Offer, Hired, Rejected.*
- `moved to Interview since next tuesday` → *I understood you're referencing a date ("next tuesday"), but couldn't parse it. Try a weekday name (e.g. "Monday"), "today", "yesterday", "N days ago", or YYYY-MM-DD.*

A missing or blank `q` is a malformed request, so it returns `400` with the
usual validation body.

### Known limitations

- **Unrecognised text becomes a name search.** `sharam` must work as a
  typo'd name, and at parse time it is indistinguishable from gibberish, so
  `asdkjf` parses successfully and simply matches nobody — the empty-result
  `message` above is what tells the recruiter how it was read. The same
  applies to `in Bananas`: the generic `in <word>` phrase is deliberately
  lenient (it could mean many things), whereas `moved to`, `reached`,
  `except` and `<Stage> candidates … not hired` are unambiguous stage
  phrases and fail loudly on an unknown stage.
- **Names containing filler words lose them.** A candidate called "An
  Nguyen" is searched as `Nguyen` (`an` is a stopword); trigram matching
  still finds them.
- **Vocabulary is fixed.** Number words other than `a`/`an` (`two weeks`),
  `last week`, `next Tuesday`, and OR-conditions are not supported.
- `reached <Stage>` with no "not hired" clause means "has ever entered that
  stage"; `reached Applied` therefore matches nobody, because entering
  Applied isn't a transition (see Phase 2).

## Recruiter UI (Phase 5)

A single-screen pipeline board: title, search box and **Add candidate** in the
header; Applied → Screening → Interview → Offer → Hired as columns; Rejected as
its own section below. Each card shows name, email, stage, and how long the
candidate has been in that stage, with the actions that apply to it.

### The rule the UI follows

**The UI only ever offers a valid action; the backend decides what is valid.**

- `domain/stages.ts` mirrors the transition rules *for UX only*. A card shows
  at most one Move button (the single next stage), Reject only for non-final
  stages, and Hired/Rejected cards show neither. There is no control that could
  express a skip or a step backwards.
- The hook refuses to send a move the rules don't allow even if something calls
  it directly (`moveToNext` on a Hired candidate resolves `null` without a
  request).
- None of that is trusted. Every action still goes to the API, which
  re-validates it. If the board is stale — another recruiter already moved the
  candidate — the server answers 409, the UI shows the server's own message
  ("Candidate is already in the OFFER stage."), and silently refetches so the
  board corrects itself. This is exercised end to end against the real
  backend: a second client moves a candidate, then the stale UI attempts its
  now-invalid move.

### Component structure

```
frontend/src/
  App.tsx                      composition + the few pieces of UI state that span components
  api/
    http.ts                    fetch wrapper, ApiError (status + message + field details)
    candidates.ts              list / create / transition / reject / search
    types.ts                   Stage, Candidate, SearchResponse (mirror of the API)
  domain/stages.ts             next stage, canReject, labels/colours, time-in-stage formatting
  domain/history.ts            timeline building, ordering, "Currently in X for …" (pure)
  domain/searchSummary.ts      filter labels, match explanations, name-only detection (pure)
  hooks/
    usePipeline.ts             ALL server-backed state and actions (see below)
    useToast.ts, useNow.ts     toast context hook; a ticking clock for "time in stage"
    useCandidateDetails.ts     fetches candidate + history by id for the drawer
    useSearchInput.ts          the search box: debounce, Enter, clear, no duplicate sends
  components/
    Header.tsx, SearchBox.tsx  top bar
    PipelineBoard.tsx          groups + sorts candidates, renders columns and Rejected
    StageColumn.tsx            one column: header, count, cards or empty placeholder
    CandidateCard.tsx          name/email/stage/time + Move / Open / Reject
    StageBadge.tsx, Button.tsx, Spinner.tsx     shared primitives (Button has a loading state)
    Modal.tsx                  native <dialog> wrapper (focus trap, Escape, backdrop for free)
    AddCandidateModal.tsx      form + client validation + server-error mapping
    ConfirmRejectDialog.tsx    reject confirmation with a busy state
    CandidateDetailsDrawer.tsx read-only details + history drawer (Phase 6)
    HistoryTimeline.tsx        the timeline list
    SearchResults.tsx          ranked results, filter chips, and every empty/failed/loading search state (Phase 7)
    SearchHelp.tsx             "I couldn't understand that search" + what can be searched
    SlowSearchNotice.tsx       appears when a search runs long
    StatusViews.tsx            skeleton, error and empty states
    ToastProvider.tsx          success/error toasts
```

Data flows one way: `App` → `PipelineBoard` → `StageColumn` → `CandidateCard`.
Cards are dumb — they receive the candidate, a `pending` flag and callbacks.

### State management

No state library: the app has one server-backed list and a handful of UI flags,
which `useState` + one custom hook handle without extra dependencies.

- **`usePipeline`** owns everything that mirrors the server: the candidate list,
  load status, a per-candidate `pending` map (`moving` | `rejecting`), and search
  state. Actions **resolve with the updated candidate and throw on failure**;
  they never touch the UI. `App` turns results into toasts. That keeps the hook
  testable without rendering anything.
- **Server is the source of truth, updates are pessimistic.** A move shows a
  spinner on that card, waits for the response, then replaces the candidate with
  what the *server* returned. Nothing moves until the backend confirms, so the
  board can't show a state the server rejected. A `409`/`404` triggers a silent
  refetch; a failed silent refetch keeps the current board rather than replacing
  it with an error page.
- **Double-actions are impossible**: an in-flight set ignores a second action on
  the same candidate, and the card's buttons are disabled while pending.
- **Search** stores the ranked ids, the parsed filters and each result's match
  info; the results view shows those candidates in the server's order (not
  re-sorted). A new search aborts the previous request, and a sequence number
  discards a response that still arrives late (see "Search experience").
- **`App`-local state** is only what crosses components: search text, which
  modal is open, and the candidate awaiting rejection confirmation.
- "Time in stage" is computed on the client from `currentStageSince`, refreshed
  every 30 s, so a candidate who moved an hour ago reads "1 hour", not "0 days".
  Within a column the longest-waiting candidate is first.

### API integration

All HTTP goes through `api/http.ts`. Vite proxies `/api` and `/health` to the
backend in development, so there is no CORS setup.

| UI action | Request | Notes |
| --- | --- | --- |
| Load board | `GET /api/candidates` | skeleton → board, or error + retry |
| Add candidate | `POST /api/candidates` | 409 → error on the Email field; 400 `details` → mapped to fields |
| Move to next stage | `POST /api/candidates/:id/transition` `{ toStage }` | always exactly the next stage |
| Reject | `POST /api/candidates/:id/reject` | only after the confirmation dialog |
| Search | `GET /api/search?q=` | query is URL-encoded |

`ApiError` carries the server's `error` message, status and field `details`, so
the UI shows the backend's wording instead of inventing its own. A network
failure becomes status `0` with "Can't reach the server…".

### States handled

Loading (skeleton; per-button spinners; "Searching…"), error with retry, empty
board with a call to action, empty column, no search matches (with how the query
was interpreted), unparseable search (with what *can* be searched), failed
search (with retry), and failed actions (toast with the server's message).
Reject and Add dialogs block dismissal while their request is in flight.

### Responsive and accessible

- Phones/tablets: columns scroll horizontally with snap, and the next column
  peeks in as a cue; at `xl` they become a 5-column grid. The header wraps and
  the search box drops to its own row on small screens.
- Real landmarks and roles (`search`, `dialog`, regions per column, `status` /
  `alert` toasts), labelled inputs with `aria-invalid`/`aria-describedby`,
  `aria-busy` on pending cards, `prefers-reduced-motion` respected on spinners.
- Modals are the native `<dialog>`, so focus is trapped and returned to the
  opener, and Escape works, without a focus-trap library.

### Scope notes

- Phase 5 shipped "Open" as a basic details dialog; Phase 6 replaced it with the
  history drawer (see "Candidate details and audit trail"). Phase 5's search was
  submit-and-filter on the board; Phase 7 replaced it with the ranked results
  view (see "Search experience").
- The drawer is opened from the card only; there is no per-candidate URL.

### Testing the UI

`npm run test:frontend` — **8 files, 193 tests** (Vitest + Testing Library, with an
in-memory fake API that can pause, script, and inspect requests):

| File | Covers |
| --- | --- |
| `domain/stages.test.ts` (22) | next-stage table, "never skip / never go back", canReject, time formatting boundaries |
| `api/http.test.ts` (7) | server messages, field details, non-JSON errors, network failure, headers |
| `hooks/usePipeline.test.tsx` (12) | refuses invalid moves, in-flight guard, refetch on 409 (not on 500), search ordering and stale-response discard |
| `App.test.tsx` (34) | loading/error/empty, grouping and ordering, per-stage actions, move (loading → success / server refusal), reject (confirm, cancel, Escape, busy, failure), add (validation, trimming, duplicate, server details), open |
| `SearchExperience.test.tsx` (33) | every example query from the brief against real captured responses, ranking and match reasons, empty query, debounce, loading, slow network, timeout, cancellation, backend/network/malformed failures |
| `domain/searchSummary.test.ts` (25) | filter labels, operator wording, match explanations, name-only detection, help content |

Component tests can't see layout, so the UI was also driven in a real Chromium
against the live backend and database (Playwright): every flow above, the stale-UI
scenario, real Escape handling, and screenshots at 1440 / 820 / 390 px. That run
also asserted the browser console stayed clean apart from the two *intentional*
409 responses.

## Candidate details and audit trail (Phase 6)

Clicking **Open** on a card opens a drawer (full-screen on phones) with the
candidate's information and their stage history. **The backend is unchanged** —
the existing `GET /api/candidates/:id` and `GET /api/candidates/:id/history`
already provide everything needed.

```
Vikram Nair
┌──────────────────────────────────────────┐
│ Currently in Interview for 3 days 7 hours│
└──────────────────────────────────────────┘
Email          vikram.nair@example.com
Phone          Not provided
Current stage  ● Interview
Date added     Sep 8

History
● Sep 8   15:36   Applied
● Sep 13  15:36   Moved from Applied → Screening
● Sep 25  15:36   Moved from Screening → Interview   [Current]
```

### Where the numbers come from

- **Fresh from the server, by id.** The drawer never reuses the board's copy of
  the candidate — that may be minutes stale. Opening it makes two requests
  (candidate + history). In the browser test a second client moved a candidate to
  Offer while the board still showed Interview; the drawer correctly showed Offer
  and the new history row.
- **"Currently in X for …" = now − the latest transition's `changedAt`** from the
  audit trail. If the candidate has never moved, it's now − `createdAt`. It is
  deliberately *not* taken from `daysInCurrentStage` or `currentStageSince`: the
  audit trail is the authoritative record, and a test feeds the component a
  contradictory `currentStageSince` to prove it is ignored.
- **The first "Applied" entry** is the candidate's `createdAt`. The audit model
  records transitions only (Phase 2), and creation isn't one, so there is no
  history row for it; the timeline adds it from the date the candidate was added.
- **Format:** two units — `3 days 7 hours`, `5 hours 12 minutes`, `12 minutes`,
  `less than a minute` — with singular/plural handled, zero units omitted
  (`3 days`, not `3 days 0 hours`), and a negative span clamped to zero. The text
  refreshes every 30 s while the drawer is open.
- **Ordering.** Oldest first, matching the brief. The server already returns
  history ascending, but the UI sorts again (stable, so equal timestamps keep the
  server's order) rather than trusting the response order; the latest entry
  carries a "Current" tag.

### Consistency between the two requests

The candidate and its history are separate requests, so a transition landing
between them would leave the stage disagreeing with the last history row (e.g.
"Screening" beside a timeline ending in "Interview"). `isSnapshotConsistent`
detects that and the drawer re-fetches, up to 3 attempts, instead of showing a
contradiction. The alternative — one combined endpoint — would be cleaner but
needs a backend change the brief asked to avoid.

### Read-only

The drawer's only controls are **Close** and, after a failed load, **Try again**.
There are no edit/delete/undo controls, no inputs, and the component only ever
issues `GET`s. This mirrors the backend, where history has no update/delete route
and a database trigger rejects any `UPDATE`/`DELETE` on it. Tests assert the
button list is exactly `["Close"]` and that no non-GET request is made.

### States

Loading spinner; failure with the server's message and a retry (404 shows
"Candidate … not found"); a candidate with no history shows the single Applied
entry plus "No stage changes yet." instead of an empty or broken list.

### Testing

New: `domain/history.test.ts` (36) — durations (including the exact
"3 days 7 hours" case and every unit-omission rule), latest-transition selection,
chronological ordering and out-of-order input, empty history, snapshot
consistency, date formatting. `components/CandidateDetailsDrawer.test.tsx` (24) —
rendering, duration from server timestamps, ordering, empty history, "Current"
marker, read-only, failure/retry, the re-fetch, and clock advance. Five App-level
tests cover opening from a card, stale board vs server, a move appearing in
history, and closing.

Mutation checks on the risky behaviours: measuring duration from
`currentStageSince` fails 15 tests; dropping the sort fails 2; reversing the
timeline fails 11; removing the empty-history note fails 2.

Real browser (Playwright, live backend and database): the displayed sentence was
compared with one computed independently from the raw API timestamps; timeline
order, timestamps and "Current" tag were checked; the no-history, rejected, live
move, stale-board and error/retry cases were exercised; console stayed clean.

### Known limitations

- **Client clock.** "Now" is the browser's clock; the timestamps are the
  server's. A device clock that is minutes off skews the duration by that much
  (a future timestamp is clamped to "less than a minute"). Correcting for skew
  would need the server's current time, e.g. from the response's `Date` header.
- The two-request approach costs an extra round trip versus a combined endpoint.

## Search experience (Phase 7)

One global search box, wired to `GET /api/search`. No AI API is involved anywhere:
the parser is the deterministic one from Phase 4, and everything below is UI on
top of it.

### What you see

| You type | You get |
| --- | --- |
| `Who's in Interview right now?` | **2 candidates found** — Filter: `Current stage = Interview` |
| `Who has been stuck in Screening for more than a week?` | **1 candidate found** — Filters: `Current stage = Screening` · `More than 7 days in current stage` |
| `sharam` | **1 candidate found** — Priya Sharma, explained as *Fuzzy name match* |
| `purple elephants` | **I couldn't understand that search.** + what was tried + **Try searching by:** name, current stage, time in stage, stage movement, hiring outcome, excluding a stage — each with a real example |
| `Who moved to Interview since Monday?` (nobody did) | **No candidates found** — Filter: `Moved to Interview since 28 Sept` — *Try removing one of these conditions.* |

Results are a **ranked list in the server's relevance order** (never re-sorted by
stage). Name searches number the results and label each with *why it matched*:
`Exact name match`, `Name starts with “priya”`, `Name contains “sharma”`, or
`Fuzzy name match`. Searches with no name part aren't numbered — there is no
relevance to rank by, so they stay in pipeline order. Move, Reject and Open all
still work from a result, and the card updates in place.

### Typing, Enter, and the empty box

- **Debounced (400 ms):** typing searches after a pause, not per keystroke, so
  half-typed phrases like `stuck in Scr` don't flash misleading results. Rapid
  typing produces one request; a query that is already showing is never re-sent
  (including "typed something and typed it back").
- **Enter / Search sends immediately** and cancels the pending debounce, so it is
  never sent twice. Enter is also how you deliberately re-run the same query.
- **Empty or whitespace-only** returns to the board with no request — including
  when you delete the text of a search that is showing.

### Loading, slow networks, failures

| Situation | What happens |
| --- | --- |
| Waiting | `Searching for “x”…` with a spinner; Search button shows `Searching…`. Previous results stay visible (dimmed) while a newer search runs; the first search shows placeholders |
| > 3 s | adds *Still searching — this is taking longer than usual. Your connection may be slow.* |
| > 15 s | the request is aborted: *The server took too long to respond*, with **Try again** |
| Newer search starts | the older request is **cancelled** (`AbortController`), and a sequence guard discards it even if it had already arrived |
| Backend error (5xx) | *Search isn't working right now* + the server's message + **Try again** / **Show all candidates** |
| Unreachable | *Can't reach the server…* + the same actions |
| Malformed 200 (no `parsedQuery`) | treated as a failure with a message, not a crash |
| Parser rejects the query | *I couldn't understand that search.* + the specific reason if there is one (e.g. `"Bananas"` is not a valid stage) + the help list |
| Board failed to load | search still works — it uses its own endpoint |

### The "purple elephants" problem, and why it's handled here

By design (Phase 4) the parser reads any unrecognised words as a **name**, because
`sharam` has to work as a misspelled surname and is indistinguishable from
gibberish at parse time. So `purple elephants` arrives as `success: true`, "name
only", zero results — technically a valid search that found nobody.

The UI treats exactly that combination — *the only thing understood was a name, and
nobody has it* — as "couldn't understand", and says so honestly:

> I couldn't understand that search. I looked for a candidate named **“purple
> elephants”** but nobody matches, and I couldn't read it as a stage, time-in-stage,
> movement or hiring-outcome search either.

That wording is deliberate. The same signal also fires for a real name that simply
isn't in the database (`Jon Smith`), so the message states what was actually tried
rather than claiming the input was nonsense. A search that *did* understand
filters but found nobody gets the different "No candidates found" panel with the
filters listed, because there the fix is to loosen a condition, not to rephrase.

### Backend change (small, additive)

The API returned a relevance `score` but not *why* a name matched, and re-deriving
exact/prefix/fuzzy on the client would duplicate the ranking tiers and drift. The
SQL already computes the tier, so each result now also carries
`matchType: "exact" | "prefix" | "word" | "fuzzy" | null` (`null` when the query
had no name part). Nothing existing changed shape; `word` is the case where the
query is a whole word inside the name (`Sharma` in `Priya Sharma`), which is not
really "fuzzy" and would have been mislabelled.

### Testing

- **Frontend, 193 tests in 8 files** (up from 143). New: `SearchExperience.test.tsx`
  (33) and `domain/searchSummary.test.ts` (25), plus hook and fake-API updates.
  Every example query from the brief runs against a **real backend response
  captured into `test/realSearchResponses.ts`**, so the tests exercise the actual
  contract rather than one invented in the test. Debounce, slow-network and timeout
  tests use fake timers.
- **Backend, 234 tests** (up from 230): `matchType` for each tier and `null`.
- **Mutation checks:** dropping the name-only handling fails the "purple elephants"
  test; removing the debounce fails 30; removing the timeout fails the timeout test.
  Removing the stale-response guard initially failed **nothing** — cancellation
  already prevented the stale response, so the guard was untested. A test with a
  transport that ignores cancellation now covers it, and the mutation is caught.
- **Manual, real browser against the live backend and database (Playwright):** all
  the brief's example queries plus the Phase 4 ones; real keystrokes for the
  debounce (6 keystrokes → 0 requests while typing → exactly 1 after the pause);
  a 4 s delayed response for the slow notice; a hung request giving up at 16 s;
  a 500, an aborted connection and a malformed 200; and moving a candidate from
  inside a result.

### Known limitations

- The "couldn't understand" case is a heuristic on the parse result. A genuinely
  absent name and gibberish look identical, hence the careful wording above.
- Results aren't paginated (fine for one job's candidates; a large pipeline would
  need it).
- The relevance `score` isn't shown to the user — the match label carries the
  meaning, and a raw similarity number would invite false precision.

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL via Prisma
- **Testing:** Vitest, Supertest

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+

## Install dependencies

This is an npm workspaces monorepo (`backend` and `frontend` are workspaces
of the root `package.json`). From the repo root:

```bash
npm install
```

This installs dependencies for the root, `backend/`, and `frontend/` in one
step.

## Configure environment variables

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

| Variable       | Purpose                                  | Default (example)                                                        |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (Prisma)     | `postgresql://postgres:postgres@localhost:5432/mini_hiring_pipeline?schema=public` |
| `PORT`         | Backend HTTP port                         | `4000`                                                                    |
| `NODE_ENV`     | Runtime environment                       | `development`                                                             |

## Configure PostgreSQL

Two databases are used: one for development, one for the test suite (kept
separate so running tests never touches your dev/seed data).

```bash
createdb mini_hiring_pipeline
createdb mini_hiring_pipeline_test
```

Or via `psql`:

```sql
CREATE DATABASE mini_hiring_pipeline;
CREATE DATABASE mini_hiring_pipeline_test;
```

Apply migrations to the dev database (uses `DATABASE_URL` from `.env`):

```bash
npm run prisma:migrate
```

Apply the same migrations to the test database (the test suite's connection
string is set in `backend/tests/setup.ts`, not `.env`):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mini_hiring_pipeline_test?schema=public" \
  npx prisma migrate deploy --schema=prisma/schema.prisma
```

Seed the dev database with 12 realistic candidates spread across every
stage (Applied, Screening, Interview, Offer, Hired, and Rejected from
several different points):

```bash
npm run db:seed
```

## Run the app

Backend (http://localhost:4000):

```bash
npm run dev:backend
```

Frontend (http://localhost:5173):

```bash
npm run dev:frontend
```

Run both in separate terminals (with PostgreSQL running and the dev database
migrated and seeded). The frontend dev server proxies `/api` and `/health` to
the backend, so no CORS configuration is needed in development.

Visit http://localhost:5173 for the recruiter board.

## Run tests

```bash
npm run test:backend
```

Requires the `mini_hiring_pipeline_test` database to exist and have
migrations applied (see above, including `pg_trgm`) — the integration tests
run against it for real, rather than mocking Prisma. As of Phase 4: **9 test
files, 234 tests**:

| Area | What it covers |
| --- | --- |
| `/health` | endpoint responds |
| Transition rules (pure) | every valid/invalid stage move, finality of Hired/Rejected |
| Transition service (DB) | history creation, no history on failure, transaction rollback |
| Candidate API (Supertest) | every endpoint, validation, 404/409/400 paths |
| Presenter (pure) | duration calculation |
| **Query parser (pure, 100 cases)** | every grammar phrase, stage synonyms, comparators, date phrases, contractions/curly quotes, combinations, select-all, each failure message, determinism |
| Date phrases / interpretation summary (pure) | weekday resolution incl. "today counts", month boundaries, invalid dates |
| **Search API (Supertest + DB)** | every example query end-to-end, ranking tiers, fuzzy matching, noise exclusion, combinations, explanations for unparseable/empty results |

Time-dependent search behaviour (duration, "since") is tested against
candidates seeded with backdated timestamps via `tests/helpers/candidates.ts`
(the public service deliberately never accepts timestamps). The parser tests
inject a fixed `now` (Wed 2026-09-23) so date resolution is deterministic.

Frontend tests (`npm run test:frontend`, **193 tests**) need no database — they
run against an in-memory fake API. See "Testing the UI" above.

## Available npm scripts (root)

| Script                  | Description                                  |
| ------------------------ | --------------------------------------------- |
| `npm run dev:backend`    | Start backend in watch mode (`tsx watch`)    |
| `npm run dev:frontend`   | Start Vite dev server                        |
| `npm run build:backend`  | Compile backend TypeScript to `backend/dist` |
| `npm run build:frontend` | Build frontend for production                |
| `npm run test:backend`   | Run backend tests (needs the test database)  |
| `npm run test:frontend`  | Run frontend tests (no database needed)      |
| `npm test`               | Backend, then frontend                       |
| `npm run prisma:generate`| Generate the Prisma client                   |
| `npm run prisma:migrate` | Run Prisma migrations                        |
| `npm run prisma:studio`  | Open Prisma Studio                           |
| `npm run db:seed`        | Seed the dev database with sample candidates |

## Design decisions and trade-offs (Phase 1)

- **npm workspaces over separate repos/Lerna/Turborepo:** the project is
  small enough that a build-orchestration tool would be overhead; npm
  workspaces gives shared installs and per-package scripts with zero extra
  dependencies.
- **Tailwind v4 (`@tailwindcss/vite`) over v3 + PostCSS config:** fewer
  moving parts (no separate `postcss.config.js`/`tailwind.config.js`
  content globs to maintain) for the same utility-class workflow.
- **`tsx` over `ts-node`/`nodemon` for backend dev:** single dependency,
  fast, native ESM/CJS interop, no extra config file.
- **Vite dev proxy over a `cors` package:** avoids adding a runtime
  dependency purely for local development; production deployment
  topology (reverse proxy, same-origin, etc.) is a later-phase decision.
- **Prisma schema committed with no models (Phase 1):** kept Phase 1 strictly
  to infrastructure, while proving the Prisma toolchain (`generate`/`migrate`
  scripts) was wired correctly before data modeling started.

## Design decisions and trade-offs (Phase 2)

- **`fromStage`/`toStage` both required, no history row on creation:** a
  `StageHistory` row always represents a real transition; a candidate's
  starting point is `Candidate.createdAt`. The alternative (a synthetic
  `null -> APPLIED` row at creation) was considered but adds a nullable
  column and a special case for no real benefit here.
- **`onDelete: Restrict` (not `Cascade`) on the `StageHistory` -> `Candidate`
  foreign key:** there is no candidate-delete feature anywhere in this
  app's requirements, so this is unreachable in practice — but `Restrict` is
  the correct default for an audit trail: if candidate deletion is ever
  added, it must not be able to silently take history with it.
- **A database trigger enforces append-only, not just "no route exists":**
  the application-layer omission (no update/delete endpoint) is the primary
  guarantee, but a `BEFORE UPDATE OR DELETE` trigger on `StageHistory` is a
  second, independent layer that holds even against direct DB access or a
  future bug. Verified directly with `psql` during development, confirming
  both the trigger and the check constraint before any application code was
  written to depend on them.
- **Separate dev and test Postgres databases:** integration tests run
  against a real database (not a Prisma mock) to actually exercise the
  trigger, check constraint, and transaction rollback — a mock would let all
  three silently regress. A second database keeps `npm run test:backend`
  from truncating your seeded dev data.
- **`transitionCandidateStage` never accepts a caller-supplied timestamp:**
  closes off a real integrity risk (a client backdating audit history)
  before any HTTP route exists to expose it, rather than fixing it later.

## Design decisions and trade-offs (Phase 3)

- **`zod` for request validation:** the one new dependency this phase.
  Hand-rolled `if` checks for name/email/enum validation get unreadable and
  error-prone fast (especially producing consistent, field-level error
  messages); zod is small, has no runtime dependencies of its own, and the
  schemas double as TypeScript types (`z.infer`).
- **409, not 400, for invalid transitions:** see "Error responses" above —
  400 is for a malformed request, 409 is for a well-formed request that
  conflicts with current state. Duplicate email on create is also modeled as
  409 for the same reason (the request is valid; the *state* conflicts).
- **`GET /api/candidates` is filterable (`?stage=`), not pre-grouped:** every
  candidate response already includes `currentStage`, so a client can group
  by stage in one pass over a flat array. Changing the response shape to
  `{ [stage]: Candidate[] }` would be a strictly worse default for the
  common case (viewing/searching across all candidates) to optimize a
  presentation concern the frontend can do trivially. `?stage=` is offered
  as a server-side convenience for the common "just this column" case.
- **No stored "time in stage" field — computed from `updatedAt` at response
  time:** duration is a live, ever-changing derived value; storing it would
  mean it goes stale the instant it's written. It's computed in
  `candidate.presenter.ts`, which is a pure function (`(candidate, now) =>
  response`) specifically so the calculation itself has direct unit tests
  independent of the database or wall-clock time.
- **`/reject` is a thin wrapper over the same transition service, not
  separate logic:** `transitionCandidateStage(id, Stage.REJECTED)` already
  enforces "any non-final stage can reject" and "Hired/Rejected can't
  change" — duplicating that as bespoke reject logic would be two places to
  keep in sync for one rule set.
- **Controllers have no `try/catch`:** relies on Express 5 forwarding a
  thrown/rejected error from an `async` handler to `errorHandler`
  automatically (a genuine Express 5 improvement over 4, where this required
  a manual wrapper). Kept controllers to a single responsibility: validate
  input, call the service, shape the response.

## Design decisions and trade-offs (Phase 4)

- **Deterministic regex pipeline, not an LLM.** Predictable, testable,
  offline, free, and the supported vocabulary is small and fixed. The cost is
  honest: phrasing outside the grammar isn't understood (see Known
  limitations), where an LLM would guess. For a recruiter tool where "why did
  this result appear" must have a stable answer, that's the right trade.
- **Extractors consume their phrase; leftovers become the name.** This is
  what lets `Priya in Screening for more than 7 days` decompose without a
  full grammar: the duration extractor takes `in Screening for more than 7
  days`, and `Priya` is what remains. The alternative — a real parser
  generator — would be more rigorous but is far more machinery than a
  seven-concept vocabulary justifies.
- **Strict vs lenient stage phrases.** `moved to X`, `reached X … not hired`,
  `except X` are unambiguous, so an unknown `X` fails with a specific
  message. `in X` and `<word> candidates` are common English ("in
  progress", "all candidates"), so an unknown word there falls through
  rather than producing a wrong-headed error.
- **`success: false` returns HTTP 200; a missing `q` returns 400.** An
  un-understood query isn't a client error — the request was valid and the
  endpoint answered it with an explanation. A missing parameter is.
- **Hybrid execution: Prisma for structure, raw SQL only for ranking.** The
  structural filters compose cleanly as a Prisma `AND` array; only
  `word_similarity` needs raw SQL. That query takes the already-filtered ids
  and stays fully parameterised (`$queryRaw` tagged template — no string
  building), so there's no injection surface. Trade-off: two round-trips
  instead of one big query, irrelevant at this scale.
- **Explain empty results rather than guess.** Since unrecognised text must
  be searchable as a name, the endpoint can't reject it up front. Instead
  every empty result carries a plain-English restatement of what was
  understood, which is what exposes `Bananas`-as-a-name.
- **Bug caught while writing tests:** ISO dates (`since 2026-09-01`) were
  initially parsed as UTC midnight while `Monday`/`yesterday` used local
  midnight — a recruiter in IST would have silently lost the first 5½ hours
  of the day. All date phrases now resolve to local midnight, and impossible
  dates (`2026-02-31`) are rejected by a round-trip check rather than
  overflowing into March.
- **Migration applied by hand.** `prisma migrate dev` hung in this
  environment while cleaning up its shadow database, after the SQL had
  already run. The migration was verified with `psql`, registered with
  `prisma migrate resolve --applied`, and the client regenerated; the
  migration file itself is standard and `prisma migrate deploy` applies it
  normally.

## Design decisions and trade-offs (Phase 5)

- **Pessimistic updates, not optimistic.** A move waits for the server before
  the card changes. Optimistic UI would feel snappier, but the backend can
  refuse any move (stale board, concurrent recruiter), and showing then
  un-showing a state is worse than a short spinner. For a tool where accuracy
  of "who is in which stage" is the whole point, correctness wins.
- **Client rules are a mirror, deliberately duplicated.** `nextStage`/`canReject`
  repeat backend logic so the UI can hide impossible actions. The cost is two
  places to update if stages change; the safeguard is that the backend never
  trusts the client and the UI resyncs on any 409. Sharing the rules through a
  shared package was considered and rejected as more build machinery than a
  6-entry table justifies.
- **No state/data-fetching library.** One list, one hook. React Query would
  add caching and retries this app doesn't need yet; the hook's contract
  (resolve with the result, throw on failure, never touch the UI) is small
  enough to swap for one later.
- **Native `<dialog>` for modals.** Gets focus trapping, Escape and top-layer
  stacking from the browser instead of a dependency. Trade-off: jsdom doesn't
  emulate `cancel` on Escape, so unit tests dispatch it manually and the real
  Escape behaviour is verified in the browser run.
- **Time in stage from timestamps, not the API's day counter.** `daysInCurrentStage`
  is 0 for the whole first day; recruiters care about "an hour" vs "23 hours".
- **Bugs found by the browser/test pass rather than by reading the code:**
  the stage badge was squeezing emails into `priya.sharma@exa…` (badge moved to
  the name row); two buttons had the identical accessible name "Clear search"
  (results-bar action renamed "Show all candidates"); and an "Escape is ignored
  mid-request" test was passing vacuously because jsdom never fires the event —
  caught by mutation-testing the guard, then fixed to dispatch `cancel`.

## What's next

Phase 8+ is not yet defined.
