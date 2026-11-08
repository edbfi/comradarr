# Implementation plan: `i18n`

## Overview

Build module 2 of the capability map as [docs/SPEC-i18n.md](../docs/SPEC-i18n.md) specifies, ported
from obzorarr: the messages Paraglide JS compiles, the message check, choosing each request's
language, the language switcher and the formatters, with D22's validations. Three tasks, one PR
each, each written test first. obzorarr built the same work in five PRs (#297–#301); here they are
grouped into three. The tasks are in [todo.md](todo.md).

## Architecture decisions

- **The riskiest work comes early.** Task 1 wires Paraglide into the build and settles the Weblate
  round trip before any page uses a message, so a surprise in the toolchain or the file format
  changes nothing written in it. Task 2 then runs the middleware through the built adapter-bun
  server, where Paraglide issue [#725](https://github.com/opral/paraglide-js/issues/725) would
  show, and settles the concurrency check.
- **Every PR leaves `main` working.** Task 1 compiles the placeholder's messages, but the page keeps
  its own text until task 2 adds the server's language handle and the browser hook. A hydrated page
  that called `m.*()` without them would let the browser runtime choose a language by itself and
  write a cookie the viewer never chose (SPEC-i18n.md, "In the browser").
- **The server, the browser and the switcher change together.** Task 2 adds both hooks and the
  switcher: each hook alone is wrong, because the server's choice means nothing if the browser
  chooses again on hydration, and the switcher is how `i18n.test.ts` shows the choice holding.
- **The message check comes with the messages.** Task 1 adds `messages.test.ts` with obzorarr's
  #301 cases, so every message written from then on is checked.
- **Each validation's evidence goes in the body of the PR that runs it:** no Node on `PATH` and the
  Weblate round trip in task 1's, the adapter-bun build and the concurrency check in task 2's, and
  the full list in task 3's, which closes D22. Obzorarr's evidence is cited only when the body
  shows the versions and files the spec lists match its `7368cff`, otherwise rerun
  (SPEC-i18n.md, "Validation"). Those files include the hooks, which don't exist until task 2, so
  task 1 reruns the Weblate round trip; task 2 may cite #298 for the concurrency check. The
  temporary messages, route and scripts are never committed.
- **Facts change in the task that changes them.** Each task updates SPEC.md's tech stack,
  Commands, Design tokens and testing sections, and AGENTS.md's structure, as its files land.
  Task 3 does the rest of the spec's "Docs this module changes when built" list and the
  end-of-work-stream cleanup.

## Task list

### Phase 1: the toolchain and the check

- [ ] Task 1: Paraglide compiles the messages, and the message check guards them

### Phase 2: each page in the viewer's language

- [ ] Task 2: each request gets the viewer's language, the browser keeps it, the switcher changes
  it

### Checkpoint: after task 2

- [ ] `check`, `test`, `lint`, `build`, `smoke` and prek pass; CI's `checks`, `smoke` and `ci-ok`
  pass.
- [ ] The built server serves `/` in Danish to a Danish browser and in English otherwise, the
  switcher changes it, and `/healthz` is unchanged.

### Phase 3: formatting, and closing the work stream

- [ ] Task 3: formatting numbers and dates, and closing `i18n`

### Checkpoint: complete

- [ ] Every success criterion in SPEC-i18n.md is met.
- [ ] The end-of-work-stream cleanup (AGENTS.md, "Cleanup procedures") is done in task 3.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The middleware returns nothing in the adapter-bun build (#725) | High | Task 2's e2e tests run against the built server |
| The CLI and the Vite plugin write different layouts into one folder | Medium | `outputStructure: "message-modules"` in the shared config; task 1 runs `check` beside `dev` |
| Weblate writes the files in a shape Biome or the plugin refuses | Medium | Task 1's round trip, rerun before any page uses a message |
| Concurrent requests mix languages under Bun's AsyncLocalStorage | High | Task 2's 200-request check against the built server, cited from #298 or rerun |
| Generated output trips Biome, Panda or the docs-set hook | Low | The two `.gitignore` lines and Panda's `exclude` land in task 1; prek runs with the output present |
| A dependency has moved since obzorarr's `7368cff`, so its evidence no longer applies | Medium | Each PR body compares the versions and files; anything moved means a rerun |
| The agents' Danish reads badly | Low | The owner may spot-check it; Weblate corrects it later (SPEC-i18n.md, "Who writes them") |

## Other apps

zondarr, otpravkarr and zimuarr port `i18n` the same way. A bug found in obzorarr's `i18n` is
fixed here, named as a difference in SPEC-i18n.md, and reported in the PR body and to the owner so
obzorarr and the others get the same fix.

## Open questions

None. The choices the port left open were put to the council; the spec PR's body records them
under "Decided by council" for the owner's review.
