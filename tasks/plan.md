# Implementation plan: `secrets`

## Overview

Build module 1 of the capability map as [docs/SPEC-secrets.md](../docs/SPEC-secrets.md) specifies,
by copying obzorarr's built `secrets` at `b9b4737` (obzorarr #283), its reference app
([Shared groundwork](../AGENTS.md#shared-groundwork)). The spec already matches obzorarr's built
spec, with comradarr's own differences. One PR (PR B) ports the code and tests and closes the work
stream. The steps are in [todo.md](todo.md).

## Architecture decisions

- **Copy, don't re-implement.** obzorarr's design, code and tests are reviewed and merged; a copy
  with only the app's names keeps the five apps the same and the review short. A real bug found
  here is fixed in obzorarr first (its own PR) and then ported, so no app drifts.
- **One PR, not a library PR first.** The library and its tests are most of the change, so
  splitting it would double the review rounds without shrinking either, and would leave unwired
  code on `main`.
- **The 14 paths** (all of obzorarr's `git diff --name-only bae6e8b b9b4737 -- src tests
  playwright.config.ts`): `playwright.config.ts`, `src/env.ts`, `src/hooks.server.ts`,
  `src/lib/server/config/secret-key{,.test}.ts`,
  `src/lib/server/security/secrets/{key-text,keyring,secret,cipher}{,.test}.ts` and
  `tests/e2e/secret-key.test.ts`.
- **The renames:** `OBZORARR`→`COMRADARR`, `Obzorarr`→`Comradarr`, `obzorarr`→`comradarr`, and no
  other change except the declared exceptions in [todo.md](todo.md).
- **D17's role passwords** come with `setup`: its labels, their names and their tests. `keyring.ts`
  is copied unchanged.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A rename changes a test's meaning (the "another app" binding test, a temp-folder prefix a leak test checks) | Medium | Declared exceptions only, and a copy proof in the PR body showing nothing else differs |
| The port drifts from obzorarr | Medium | The copy proof; bugs are fixed in obzorarr first |

## Open questions

None. The owner approved the spec and this plan (2026-10-31).
