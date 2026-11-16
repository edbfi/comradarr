# Tasks: `setup`

The spec is [docs/SPEC-setup.md](../docs/SPEC-setup.md), and the plan is [plan.md](plan.md). Each
task is one PR on a new branch from a freshly fetched `origin/main`, writes its tests first, ports
obzorarr's tests where the spec keeps its wording, updates AGENTS.md's status and structure and
the docs whose facts it changes, ticks off its items here, names the sibling apps in its PR body,
and runs `bun run --bun check`, `test`, `lint`, `build`, `smoke` and
`prek run --all-files --hook-stage manual` before every commit. Each build PR gets a council
review. Paths under `src/lib/server/` are shortened to `server/`.

## Task 1: the database (D15)

**Description:** Add `drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11, a PostgreSQL for the tests,
and open and migrate the database at startup on the owner URL, with D15's validation. Startup moves
into `server/services/setup/startup.ts`: the key, `COMRADARR_DATABASE_URL` (or `…_FILE`), the wait
for PostgreSQL, then the migrations. `settings`, `owner` and `audit_log` with its `audit_action`
enum (the four `setup` codes) go into the first migration (the spec); no operations yet.

**Acceptance criteria:**
- [x] `tests/database.ts` provisions as the spec says (the variable or a labelled `postgres:18`
  container on a free port, a database and owner role per test file, clean-up of what the run
  created, a clear failure without either); Vitest uses it in a global setup and Playwright's
  config synchronously in the runner process only.
- [x] `server/config/database-url.test.ts` first fails, then passes: one variable or the file, both
  set refused, empty as unset, the 4 KiB cap and one trailing newline, the scheme, user and
  database checked, and no message ever echoing the URL.
- [x] `server/db/migrate.test.ts` first fails, then passes: the bundled migrations apply to a new
  database, the three tables and the enum exist, a second run applies nothing, and the records
  match Drizzle Kit's own migrator's; or the fallback ships `drizzle/` beside `build/`, and the test
  covers that path. A failed migration stops startup, thrown with its name and PostgreSQL's reason,
  and the built server exits non-zero.
- [x] `server/db/client.test.ts`: rollback isolation (D6), and the wait for PostgreSQL (retried
  on a refused connection, a host that doesn't resolve and `57P03` within 30 seconds, every 2
  seconds; an authentication failure at once).
- [x] `server/db/parameterised.test.ts` passes on the code and fails on a planted `sql.raw` and a
  planted string-built query, while a tagged `sql` interpolation passes.
- [x] `tests/e2e/setup.test.ts`: the built server migrates a new database, serves `/healthz`, starts
  again on it, and refuses to start without a database URL or with both variables, echoing
  neither.
- [x] The PR body records the time the 18 container adds to a run.
- [x] D15's validation is in the PR body: migrations, `check`, `bun --no-install ./build` with no
  `node_modules`, rollback isolation, CI's jobs on Docker with no CI change, and the gates with
  failing `node`, `npm` and `npx` on `PATH`.

**Verification:** the gates; `bun --no-install ./build` against a PostgreSQL in Docker migrates a
new database.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `drizzle.config.ts`, `drizzle/`, `src/env.ts`,
`src/hooks.server.ts`, `server/config/{database-url,config-error}.ts` (+ test),
`server/db/{client,migrate,settings,owner,audit}.ts` (+ tests), `server/db/parameterised.test.ts`,
`server/services/setup/startup.ts`, `tests/database.ts`, `vite.config.ts` (Vitest's global setup),
`playwright.config.ts`, `tests/e2e/setup.test.ts`, README (the database URL, PostgreSQL 16+, the
test database), SPEC.md (tech stack, `db:generate`, Commands, testing), decisions.md (D15),
AGENTS.md.

**Size:** L. One unit: D15's validation needs the client, the migrator, startup and the test
database together in the built server.

## Task 2: the roles and their privileges (D16, D17)

**Description:** The pre-flight check, the two roles named after the database with passwords
derived from the master key and set as SCRAM verifiers, the privilege matrix (with `audit_log`'s
rules), revoking `PUBLIC`'s `CREATE` and `TEMPORARY`, the owner connection closed after migrations,
and requests on the app role's pool. `tests/database.ts` gains `postgres:16`.

**Acceptance criteria:**
- [x] `server/security/secrets/keyring.test.ts` gains the two role passwords under their HKDF
  labels, 43 characters of base64url, the same for the same key and different across keys.
- [x] `server/db/preflight.test.ts` first fails, then passes, on PostgreSQL 16 and 18: each refusal
  of the spec, named, all at once, before anything changes.
- [x] `tests/database.ts` provides `postgres:16` from Docker, or `COMRADARR_TEST_DATABASE_URL_16`
  when it is set; without either, the 16 run fails clearly, like the 18 one.
- [x] `server/db/roles.test.ts`, on 16 and 18: roles created, passwords set as verifiers (fresh
  salt, 4096 iterations; the app role logs in with the derived password, and again after a new
  key), and the D16 privilege checks of the spec's Validation, effective privileges included,
  also on a database whose `public` schema still grants `CREATE` to `PUBLIC`; a database name with
  a `"` and capitals still gets correctly quoted roles; a `pg_hba.conf` rejection of the app role
  fails with PostgreSQL's `28000` and an error naming the role. On the Docker container the
  rejection is real: a `reject` line first in the file `SHOW hba_file` names, scoped to this test
  file's database and app role, `pg_reload_conf()`, and the line removed and reloaded afterwards.
  With an external test URL, nobody's server is edited: the same error handling runs against a
  `28000` the test's client returns. CI always uses Docker, so it always runs the real case.
- [x] `parameterised.test.ts` exempts exactly `db/roles.ts` (the role statements) and
  `db/migrate.ts` (the reviewed migrations).
- [x] No password or verifier in a thrown error, and no plaintext password in PostgreSQL's statement
  log, which shows the verifier the app sends by design (a test searches both; task 3 adds the
  log entries).
- [x] The PR body records the time the 16 container adds to a run.
- [x] e2e: the built server serves as the app role with the owner connection closed (the server's
  PostgreSQL sessions), and refuses to start with an owner role without `CREATEROLE`, echoing no
  value.

**Verification:** the gates; D16 and D17's evidence in the PR body.

**Dependencies:** task 1.

**Files:** `server/db/{preflight,roles,client}.ts` (+ tests), `server/db/parameterised.test.ts`,
`server/security/secrets/keyring.ts` (+ test), `server/services/setup/startup.ts`,
`tests/database.ts`, `tests/e2e/setup.test.ts`, README (the roles, `pg_hba.conf`), decisions.md
(D16 Decided, D17's version and names), AGENTS.md.

**Size:** L. The roles and the matrix are one unit: the privilege tests need both.

## Task 3: logging with redaction and the request id

**Description:** obzorarr's logger and redaction, ported at `b59b909` with comradarr's additions:
secret-shaped values, an empty allowlist, `COMRADARR_LOG_DEBUG`, the request id in
`AsyncLocalStorage` and `event.locals`, one line per request, and `handleError` through the logger.
A failed startup step is logged, then thrown.

**Acceptance criteria:**
- [x] `server/logging/redact.test.ts` first fails, then passes: obzorarr's cases, ported, and
  comradarr's (argon2 hashes, three-part tokens, `v1.` ciphertexts), with the linear-time growth
  check.
- [x] `server/logging/logger.test.ts`: the entry's shape, one line per entry, debug behind the
  switch, entries during a request carrying its id, and the request line (query values removed,
  `/healthz` at debug).
- [x] `server/config/log-debug.test.ts`: `true`, `false`, empty as unset, anything else refused
  before the database, without the value.
- [x] `handleError`, unit-tested: an unexpected error becomes one redacted JSON entry with the
  request id from `event.locals`, and the answer carries the generic message and the id. No route
  that throws ships in the build.
- [x] A startup failure is one entry and the thrown error; `secret-key.test.ts` still passes. A
  pending migration logs its name with the backup reminder, a failed one is one entry, and the
  wait for PostgreSQL logs its first failure at warning.
- [x] No verifier, password or database URL in a log entry (a test searches startup's output).

**Verification:** the gates; the built server logs one line per request.

**Dependencies:** task 1.

**Files:** `server/logging/{logger,redact}.ts` (+ tests), `server/config/log-debug.ts` (+ test),
`src/env.ts`, `src/app.d.ts`, `src/hooks.server.ts`, `server/services/setup/startup.ts`,
`tests/e2e/setup.test.ts`, README (logs), decisions.md (D14's logging half), AGENTS.md.

**Size:** M.

## Task 4: shutdown

**Description:** obzorarr's shutdown, ported: `SIGHUP` as `SIGTERM`, stopping work on the signal,
closing the pool and flushing the logs on `sveltekit:shutdown`, and the 5-second deadline, only in
the built server.

**Acceptance criteria:**
- [ ] `server/services/setup/startup.test.ts` first fails, then passes: obzorarr's shutdown cases
  (order, exit codes, the deadline with its bounded flush, no handlers in `dev`, handlers a turn
  after `init`), with the pool's close.
- [ ] e2e: `SIGTERM` and `SIGHUP` each stop the built server with exit code 0.
- [ ] The README's server limits and `stop_grace_period`.

**Verification:** the gates; Ctrl+C still ends `dev`.

**Dependencies:** task 3.

**Files:** `server/services/setup/startup.ts` (+ test), `server/logging/logger.ts` (the flush),
`server/db/client.ts`, `tests/e2e/setup.test.ts`, README, AGENTS.md.

**Size:** M.

## Task 5: the health check

**Description:** `/healthz` reports the overall and the database's status as the spec's JSON, 200
or 503, closing ground-floor choice 5.

**Acceptance criteria:**
- [ ] `server/services/health.test.ts` first fails, then passes: healthy, and unavailable when the
  query fails or takes over 2 seconds, with no version, timing or error in the answer.
- [ ] `routes/healthz/server.test.ts` and the smoke test move to the new answer, with
  `cache-control: no-store`; `HEAD` works. The database-down answer stays a unit test: the test
  PostgreSQL is shared, so no e2e stops it.

**Verification:** the gates.

**Dependencies:** task 2.

**Files:** `server/services/health.ts` (+ test), `src/routes/healthz/+server.ts` (+ test),
`tests/e2e/{smoke,setup}.test.ts`, SPEC.md (ground-floor choice 5, testing), README, AGENTS.md.

**Size:** S.

## Task 6: `ORIGIN`, the security headers, the CSP and its report endpoint

**Description:** `ORIGIN` checked at startup, the headers on every response through `handle`, the
nonce CSP with `style-src-attr 'unsafe-inline'` and `report-uri`, and `/api/csp-report`, closing
ground-floor choice 3.

**Acceptance criteria:**
- [ ] `server/config/origin.test.ts` (obzorarr's, ported) and `server/security/headers.test.ts`
  (obzorarr's cases plus the permissions list, opener and resource policies, never
  `includeSubDomains`).
- [ ] `routes/api/csp-report/server.test.ts`: the accepted type and size, the bounded log entry, a
  204 for everything, the oversized body read only to the cap.
- [ ] e2e: the headers on a page, `/healthz` and a 404, no HSTS over plain HTTP, no `Server` or
  `X-Powered-By`; the policy directive by directive; the nonce on every script; no violation on a
  page; a provoked violation reaching the log; the refused `ORIGIN`s.

**Verification:** the gates; `preview` in both languages by hand.

**Dependencies:** task 3.

**Files:** `server/config/origin.ts` (+ test), `server/security/headers.ts` (+ test),
`src/routes/api/csp-report/+server.ts` (+ test), `src/hooks.server.ts`, `src/env.ts`,
`vite.config.ts`, `tests/e2e/setup.test.ts`, README (`ORIGIN`), SPEC.md (ground-floor choice 3),
AGENTS.md.

**Size:** M.

## Task 7: the cross-origin check and the error format

**Description:** obzorarr's cross-origin check and its refusal, with SvelteKit's form check off in
the same PR, and the error format, which the JSON refusal uses first and `handleError` moves onto
as `internal_error`.

**Acceptance criteria:**
- [ ] `server/security/cross-origin.test.ts` (obzorarr's matrix, ported) and `vite.config.test.ts`,
  which Vitest's `include` gains (AGENTS.md's "Vitest runs" line with it).
- [ ] `lib/shared/errors/problem.test.ts` and `server/security/access-denied.test.ts`: the shape,
  the message keys, both languages, the page's own policy and `color-scheme` meta with no style.
- [ ] `handleError` answers JSON callers with `internal_error` in the format, with the matching
  request id and translated messages (`error_internal_error_*` and `error_access_denied_*` in both
  languages).
- [ ] e2e: obzorarr's cross-site, same-origin and `app.test` cases, a JSON caller's error, and a
  browser's CSP report passing the check on `app.test`.
- [ ] The README's proxy fix.

**Verification:** the gates.

**Dependencies:** task 6.

**Files:** `server/security/{cross-origin,access-denied}.ts` (+ tests),
`src/lib/shared/errors/problem.ts` (+ test), `vite.config.ts` (+ test), `src/hooks.server.ts`,
`messages/{en,da}.json`, `tests/e2e/setup.test.ts`, README, AGENTS.md.

**Size:** M.

## Task 8: the audit trail and the bootstrap token

**Description:** The audit writer, the action list and startup's enum check; obzorarr's token and
first-run state, ported, printed in comradarr's banner and audited at every printing.

**Acceptance criteria:**
- [ ] `server/services/audit/record.test.ts` first fails, then passes: an entry's fields, the
  app's own entries with no request fields, the context redacted, the user agent cut, a failed
  write logged.
- [ ] Startup stops when the database lacks a code in `actions.ts`, naming it; `actions.ts` notes
  the spec's rule that a migration never uses a code added in the same release.
- [ ] `server/security/bootstrap-token.test.ts` and `server/services/setup/first-run.test.ts`
  (obzorarr's, ported): format, bias, expiry, comparison, renewal held during a claim, none after
  stopping or once claimed; the banner's lines, the link only with `ORIGIN`, `setup.token_printed`
  each time.
- [ ] e2e: the banner before "Listening on"; the token never in a log entry, a response or
  `audit_log`.

**Verification:** the gates.

**Dependencies:** tasks 2, 3 and 6 (`ORIGIN` for the link).

**Files:** `server/services/audit/{actions,record}.ts` (+ tests), `server/db/audit.ts`,
`server/security/bootstrap-token.ts` (+ test), `server/services/setup/{first-run,startup}.ts`
(+ tests), `tests/e2e/setup.test.ts`, AGENTS.md.

**Size:** M.

## Task 9: the owner's credentials

**Description:** obzorarr's `password.ts` and its list, ported with "comradarr" as the app's name,
and the rules the browser can check moved into `lib/shared/password-rules.ts`.

**Acceptance criteria:**
- [ ] `server/security/password.test.ts` (obzorarr's, ported, the #337 and #342 cases included).
- [ ] `lib/shared/password-rules.test.ts`, and a test that the two agree on every case.
- [ ] The list is obzorarr's file, its source and rebuild recipe named in `password.ts`; gitleaks
  passes.

**Verification:** the gates.

**Dependencies:** none (after task 1, for order).

**Files:** `server/security/{password.ts,password.test.ts,common-passwords.txt}`,
`src/lib/shared/password-rules.ts` (+ test), AGENTS.md.

**Size:** S.

## Task 10: the claim at `/setup`

**Description:** The claim in the spec's order, its audit entries, the page through `/impeccable`
with the brief's claim step, and startup reading the pointer back. No gate yet.

**Acceptance criteria:**
- [ ] `server/services/setup/claim.test.ts` (obzorarr's cases, ported): success with its three
  audit entries in the transaction; a field error leaving the token unused; a wrong and an expired
  token never reaching the hash, each audited with its outcome; a second claim; two at once
  leaving one owner and one grant; a field error audited as `invalid`; a failed transaction
  printing a new token, none after shutdown, and audited as `failed` on its own with no entry of
  the grant; a restart reading the pointer back.
- [ ] `routes/setup/token-format.test.ts` (obzorarr's) and the fragment filled in and removed.
- [ ] The page meets the brief: checked at 360, 390, 768 and 1440 px, 200% zoom, the keyboard,
  reduced motion and every state the brief names, in English and Danish, with screenshots and
  Impeccable's finish review in the PR body, and DESIGN.md refreshed if the finish asks.
- [ ] e2e: the link fills the token; a wrong token refused, keeping the typed username and
  clearing the token and password; the rules list; the language switcher; the right token, upper
  case without dashes, claims and lands on `/`; `/setup` and its action 404, also after a restart;
  neither secret in the output, a response or `audit_log`.

**Verification:** the gates; a manual claim over plain HTTP from another machine's address.

**Dependencies:** tasks 7, 8 and 9.

**Files:** `server/services/setup/{claim,first-run}.ts` (+ tests), `server/db/{owner,settings}.ts`,
`src/routes/setup/{+page.svelte,+page.server.ts,token-format.ts}` (+ test), `messages/`,
`.impeccable/surfaces/route-setup.md` (its direction contract), `tests/e2e/setup.test.ts`,
AGENTS.md.

**Size:** L. The page and the claim are one slice; the credentials (task 9) are already apart.

## Task 11: the setup gate

**Description:** The gate as the last `setup` stage: a 303 to `/setup` for every request but its
exceptions, a 503 `setup_incomplete` for JSON callers, and the Playwright global setup that claims
the instance.

**Acceptance criteria:**
- [ ] `first-run.test.ts`: the gate's decision for each path, JSON callers, and after a restart.
- [ ] `playwright.config.ts`'s `wait.stdout` captures the banner's token; `global-setup.ts` claims
  through the form, so `smoke.test.ts` and `i18n.test.ts` run unchanged.
- [ ] e2e: every page sends a fresh instance to `/setup`, a JSON caller gets the 503
  (`error_setup_incomplete_*` in both languages), `/healthz` and the report endpoint still answer,
  the headers are on the redirect. Every earlier page-level test in `setup.test.ts` (the headers on
  a page, the nonce, no violation, the plain-HTTP host test) claims its server first, so none
  silently tests `/setup`.
- [ ] The README's first run.

**Verification:** the gates; success criterion 2 by hand over plain HTTP.

**Dependencies:** task 10.

**Files:** `server/services/setup/first-run.ts` (+ test), `src/hooks.server.ts`,
`playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/setup.test.ts`, `messages/`,
README, AGENTS.md.

**Size:** M.

## Task 12: the Compose example and the restore (D18)

**Description:** The README's Compose example (PostgreSQL 18 with its `pg_isready` health check,
`depends_on`, `stop_grace_period`, the two secrets) and its backup and restore commands, tested.

**Acceptance criteria:**
- [ ] A test runs the README's exact `pg_dump --no-owner --no-privileges` and restore into a new
  PostgreSQL with no comradarr roles, starts the built server with the same key, and finds the
  roles, their privileges, the owner and the audit history.
- [ ] The Compose example starts, is claimed through the banner's link, and survives a restart (by
  hand, in the PR body).

**Verification:** the gates.

**Dependencies:** task 11.

**Files:** README, `tests/e2e/restore.test.ts` (or the integration test the build finds fits),
decisions.md (D18), AGENTS.md.

**Size:** S.

## Task 13: close the work stream

**Description:** Cleanup procedure 2: SPEC-setup.md reduced to what code and tests can't say, the
"later modules keep" blocks moved to their modules' notes in SPEC.md, the status lines, and
`tasks/` deleted, with the preservation table in the PR body.

**Acceptance criteria:**
- [ ] Every success criterion in the spec is met, with evidence linked.
- [ ] Every removed requirement maps to a test, code, another doc or an approved change.

**Dependencies:** task 12.

**Files:** `docs/SPEC-setup.md`, `docs/SPEC.md`, `docs/decisions.md`, AGENTS.md, `tasks/`.

**Size:** S.
