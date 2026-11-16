# Implementation plan: `setup`

Source spec: [docs/SPEC-setup.md](../docs/SPEC-setup.md), approved by the owner on 2026-11-16.

## Overview

Build module 3 of the capability map as the spec says: startup checks, PostgreSQL with its roles
and migrations, logging with redaction, shutdown, the health check, the security headers, CSP and
its report endpoint, the cross-origin check with the error format, the audit trail, the bootstrap
token, the claim and the setup gate, and the Compose example with its tested restore. Twelve tasks,
one PR each, each test first, then a docs PR that ends the work stream. The tasks are in
[todo.md](todo.md).

The split starts from obzorarr's (#324): the riskiest part first, the request checks before any
form, the gate last. comradarr's own additions get tasks of their own (the roles, health, the audit
trail, the credentials, the Compose example) or join the task their code belongs to (the report
endpoint with the CSP, the error format with the refusal, the request id with the logger).

## Architecture decisions

- **The riskiest part lands first.** Task 1 is D15's validation: Drizzle 0.45 on Bun SQL, migrations
  bundled into the build, and a PostgreSQL for every test run through `tests/database.ts`. If the
  migrator can't take migrations as text, the spec's fallback (`drizzle/` beside `build/`) is known
  before anything is built on it. Task 2 then proves D16 and D17 on PostgreSQL 16 and 18.
- **The runtime role arrives in task 2.** Task 1 runs migrations and the app on the owner URL; task
  2 adds the pre-flight check, the two roles and the privilege matrix, and moves requests onto the
  app role's pool. No release is cut in between.
- **All three tables come with the first migration** (the spec): `settings`, `owner` and
  `audit_log` with its enum land in task 1, the audit table's privileges in task 2, and its writer,
  the action list and startup's enum check in task 8 with the first entry, the token's printing.
  Named operations still join with their first caller.
- **A PostgreSQL for the tests** comes from one helper. Vitest starts it in a global setup (async);
  Playwright's config can't await before the web server starts, so it provisions synchronously
  (`docker run -d`, then `pg_isready` until ready) in the runner process only, as obzorarr's config
  creates its temporary folder there, and removes the container on exit. Both reuse
  `COMRADARR_TEST_DATABASE_URL` when it is set. Task 2 adds `postgres:16` for the role and
  privilege tests, from Docker unless `COMRADARR_TEST_DATABASE_URL_16` names one.
- **Startup grows task by task** in `services/setup/startup.ts`: the key, the configuration
  (`COMRADARR_DATABASE_URL` in task 1, `COMRADARR_LOG_DEBUG` in task 3, `ORIGIN` in task 6, all
  checked before the database), the database (tasks 1 and 2), then first run (tasks 8 to 11).
  `hooks.server.ts` only calls services (Code structure).
- **Startup failures are thrown first and logged later,** as in obzorarr: until task 3 brings the
  logger, a failed step throws from `init` as the key error does, and task 3 adds the log lines
  the spec gives the migrations and the wait for PostgreSQL.
- **The request checks come before any form.** Task 7 switches SvelteKit's form check off and puts
  the cross-origin check in its place in one PR, so `main` never has neither. The CSP report
  endpoint arrives in task 6, before that check exists, and task 7's e2e shows a real report still
  passes it.
- **The gate comes last.** Task 10 makes the claim work at `/setup` with every other page still
  served, so the smoke and language tests run unchanged; task 11 adds the gate with the Playwright
  global setup that claims the instance.
- **Errors take the error format in task 7.** Task 3's `handleError` returns the generic message
  and the request id; task 7 brings the format and moves `handleError` onto it as
  `internal_error`. Task 11 adds `setup_incomplete`.
- **No test route ships.** `handleError` is unit-tested; the build adds no route that throws.
- **The refusal page has no styles.** Its fixed policy allows none, so it sets its colour scheme
  with `<meta name="color-scheme" content="dark">` and holds no raw values.
- **Signal handlers only in the built server,** one turn after `init` resolves, as obzorarr's.
- **Generated migrations are formatted:** `db:generate` runs Biome on `drizzle/` after Drizzle Kit,
  so the shared `biome.json` stays unchanged.
- **Facts change in the task that changes them.** Each task updates the README, SPEC.md (status,
  tech stack, Commands, testing), decisions.md and AGENTS.md's status and structure, and ticks off
  its items here. Each PR body names the sibling apps that need the same change. Task 13 reduces
  the spec and deletes `tasks/`.

## Task list

### Phase 1: the foundations

- [ ] Task 1: the database (D15)
- [ ] Task 2: the roles and their privileges (D16, D17)
- [ ] Task 3: logging with redaction and the request id
- [ ] Task 4: shutdown
- [ ] Task 5: the health check

### Checkpoint: after task 5

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass with no CI change.
- [ ] The built server waits for PostgreSQL, checks the owner role, migrates, sets both roles,
  serves as the app role, logs JSON lines, reports the database on `/healthz`, and exits 0 on
  `SIGTERM` and `SIGHUP`.

### Phase 2: the request checks

- [ ] Task 6: `ORIGIN`, the security headers, the CSP and its report endpoint
- [ ] Task 7: the cross-origin check and the error format

### Checkpoint: after task 7

- [ ] Every page carries the headers and the nonce CSP with no violation; a provoked violation is
  logged through the report endpoint.
- [ ] A cross-site POST gets the "Access denied" page or the JSON error, in the viewer's language.

### Phase 3: first run

- [ ] Task 8: the audit trail and the bootstrap token
- [ ] Task 9: the owner's credentials
- [ ] Task 10: the claim at `/setup`
- [ ] Task 11: the setup gate
- [ ] Task 12: the Compose example and the restore (D18)

### Checkpoint: complete

- [ ] Every success criterion in SPEC-setup.md is met.

### Phase 4: closing

- [ ] Task 13: close the work stream (cleanup procedure 2)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Drizzle 0.45's migrator can't apply migrations from text | Medium | Task 1 tries its dialect's `migrate` with the journal's hashes and compares the records with Drizzle Kit's file migrator; otherwise `drizzle/` ships beside `build/` (the spec's fallback) |
| Drizzle's `bun-sql` adapter or Bun SQL misbehaves (transactions, types, TLS parameters) | High | Task 1's rollback-isolation and round-trip tests run in the built server; a failure stops the build and goes to the owner (another driver is a new dependency) |
| Docker isn't usable in CI's jobs or in prek's `tests` hook | High | Task 1 runs CI on the PR before anything depends on it; a needed CI change goes to the owner first (the spec) |
| prek gets slow with a container per run | Medium | One container per run, a database per test file from a template; task 1 records the time added |
| `CREATEROLE` behaves differently on 16 and 18, or the owner role can't set a SCRAM verifier | High | Task 2's role and privilege tests run on both versions |
| A grant the matrix misses, or one `PUBLIC` still holds, lets the app role change the schema or the audit trail | High | Task 2 checks effective privileges, also on a database whose `public` schema still grants `CREATE` |
| An audit code used in the migration that adds it fails the whole migration | Medium | The spec's authoring rule, noted in `actions.ts` (task 8); no `setup` migration uses a code, and startup's enum check catches a missing one |
| Playwright's web server starts before its global setup, so the database must exist when the config loads | Medium | Task 1 provisions synchronously in the runner process (above) |
| The CSP report endpoint fills the log before `sign-in`'s limit | Low | Bounded context per report; accepted in the spec until `sign-in` |
| The token or a password reaches a log entry, a response or the audit trail | High | Tasks 8 and 10 search the server's output, every response and `audit_log` |
| Playwright's URL check wins the race against the banner's token line | Medium | Task 11's `wait.stdout` pattern spans the token line through "Listening on" |
| Startup forgets a completed first run, so the gate sends every page to a `/setup` that answers 404 | High | Task 10 restarts the built server on a claimed database |
| A field error or a wrong token costs a hash | Medium | Task 10's unit tests |
| `node` sneaks into the validation | Low | Task 1 runs the gates with failing `node`, `npm` and `npx` shims on `PATH`, as CI does |

## Porting

comradarr ports obzorarr's code and tests where the spec keeps obzorarr's wording: the logger and
redaction, `ORIGIN`, the headers, the cross-origin check, the token, the credentials and their
list, the claim's order and the gate. Each task's PR names what it took from obzorarr and what
differs. Code is never brought over from comradarr's `legacy-old/v1` or
`feat/comradarr-implementation-plan` branches.

## Open questions

None. The owner approved the spec on 2026-11-16. As with obzorarr's #324, this task list is
approved by the orchestrating session after the council's review, and merged once its review loop
ends.
