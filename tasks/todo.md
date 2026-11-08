# Tasks: `i18n`

The spec is [docs/SPEC-i18n.md](../docs/SPEC-i18n.md), and the plan is [plan.md](plan.md). Each
task is one PR and writes its tests first. Each one adds its files to AGENTS.md's structure, ticks
off its items in `tasks/`, names the sibling apps in its PR body (AGENTS.md, Shared groundwork), and
runs `bun run --bun check`, `bun run --bun test`, `bun run --bun lint` and
`prek run --all-files --hook-stage manual` before every commit. Paths under `src/lib/` are
shortened to `lib/`.

## Task 1: Paraglide compiles the messages, and the message check guards them

**Description:** Add the two packages and the inlang project, and compile the messages in
`prepare`, `check`, dev, build and Vitest. The message files hold the placeholder page's text in
English and Danish, which the page starts using in task 2. Add the message check with obzorarr's
#301 cases. Settle the Weblate round trip.

**Acceptance criteria:**
- [x] `@inlang/paraglide-js` and `@inlang/plugin-i18next` are exact-pinned dev dependencies at
  their newest stable release (3.2.1 and 6.5.3 on 2026-11-08, D25).
  `project.inlang/settings.json` and `project.inlang/paraglide.config.ts` are as the spec gives
  them, and the Vite plugin is added with nothing else.
- [x] `prepare` and `check` compile the messages after `svelte-kit sync` and before Panda's
  codegen, calling the CLI as `bun --bun <bin>`, so a fresh clone's `bun ci` compiles them, and
  `check` then type-checks `project.inlang/*.ts`. Everything passes with no Node on `PATH` (CI's
  shims). Running `check` while `dev` is up doesn't rewrite the output under the dev server.
- [x] A call to a message that doesn't exist fails `check`, shown with a probe that isn't
  committed, its output in the PR body.
- [x] `src/lib/paraglide/` and `project.inlang/cache/` are gitignored, Panda's `exclude` skips the
  output, and `lint` and prek pass with it present.
- [x] The message files are flat and Biome-formatted and hold `placeholder_title` and
  `placeholder_body` as the spec gives them, with the name Comradarr only as `{{name}}`;
  `language_switcher_label` comes with the switcher in task 2. The page's text stays as it is until
  task 2.
- [x] `lib/shared/i18n/messages.test.ts` holds the check and its tests, with #301's cases. Test
  first: once the toolchain compiles, `checkMessages` stubbed to return `[]` makes every case that
  breaks a rule fail (output in the PR body). With the check, it passes on `messages/*.json`; every
  rule in the spec's list, each clause on its own, has an in-memory file that breaks only it and is
  reported, with the exact list of problems asserted; and a file with several problems reports them
  all.
- [x] The Weblate round trip passes all four of the spec's conditions. The files the spec's
  "Validation" lists include the hooks, which task 2 writes, so here the condition for citing
  obzorarr's #297 can't hold: the round trip is rerun, with the script and its output in the body.
  Neither the script nor its temporary message is committed.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** none.

**Files:** `package.json`, `bun.lock`, `project.inlang/settings.json`,
`project.inlang/paraglide.config.ts`, `messages/en.json`, `messages/da.json`,
`lib/shared/i18n/messages.test.ts`, `vite.config.ts`, `tsconfig.json`, `panda.config.ts`,
`.gitignore`, `AGENTS.md`, `docs/SPEC.md` (the tech-stack table, the setup fact, the Commands rows
for `bun ci` and `check`, and the testing section).

**Size:** M.

## Task 2: each request gets the viewer's language, the browser keeps it, the switcher changes it

**Description:** Run every request through `paraglideMiddleware` in `handle`, write the language
into `<html lang>`, and keep the page's language in the browser. The placeholder page renders its
text from the messages and shows `LanguageSwitcher.svelte`, with the global keyboard-focus rule.

**Acceptance criteria:**
- [x] `tests/e2e/i18n.test.ts`, against the built server, written first: a `da-DK` browser gets
  `/` in Danish with `<html lang="da">` and `Vary: Cookie, Accept-Language`; pressing "English"
  reloads `/` in English and writes `PARAGLIDE_LOCALE=en` with `SameSite=Lax` and without `Secure`
  over plain HTTP, and the next visit stays in English; a browser whose header says `fr-FR` and
  whose `navigator.languages` an init script sets to `fr-FR`, `da-DK` gets English, the switcher
  marks English as current after hydration, pressing it does nothing, and no cookie is written. None
  logs a console error. The smoke test passes unchanged in English.
- [x] The placeholder renders its messages as text, never with `{@html}`, filling `{{name}}` with
  the name Comradarr; `<title>` stays the name.
- [x] `app.html` has `<html lang="%lang%">` with the Biome suppression just above it, which doesn't
  contain the token. `hooks.server.ts` and `hooks.client.ts` are as the spec's Code style gives
  them, and the `init` hook is unchanged.
- [x] The switcher is a labelled group of native buttons, the label a message, each button naming
  its language in that language with `lang` set, from `Intl.DisplayNames` with the first letter
  upper-cased in that language ("English", "Dansk"), through a helper private to the component,
  never a message or a literal. The current language's button has `aria-current="true"` and does
  nothing when pressed; another calls `setLocale`. It is styled only with tokens, and sits beside
  the placeholder's heading.
- [x] `panda.config.ts`'s `globalCss` has the one `:focus-visible` rule the spec gives (DESIGN.md's
  2px `secondary` ring, 2px offset), and SPEC.md's Design tokens section gains obzorarr's bullet:
  "Keyboard focus is one global rule in `globalCss`: DESIGN.md's 2px `secondary` ring with a 2px
  offset on every `:focus-visible` element, so controls don't each restyle it."
- [x] The concurrency check passes: 200 concurrent requests in both languages against the built
  server, through a temporary route that awaits a random delay in its `load`, each render in their
  own language. Cited from obzorarr's #298 only if the PR body shows that the versions and files the
  spec's "Validation" lists match `7368cff`; otherwise rerun, with the script and its output in the
  body. Neither it nor the route is committed.
- [x] D18 no longer lists browser interaction with a real component.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek. Manual check in
`dev`: a browser set to Danish sees the placeholder in Danish. Manual check at 360, 390, 768 and
1440 px, at 200% zoom and with reduced motion: both buttons are reachable by keyboard, focus is
visible, and pressing the current language does nothing.

**Dependencies:** task 1.

**Files:** `src/app.html`, `src/hooks.server.ts`, `src/hooks.client.ts`,
`lib/components/layout/LanguageSwitcher.svelte`, `src/routes/(public)/+page.svelte`,
`messages/en.json`, `messages/da.json`, `panda.config.ts`, `tests/e2e/i18n.test.ts`,
`docs/decisions.md`, `AGENTS.md`, `docs/SPEC.md` (the testing section, the `smoke` Commands row and
the Design tokens section).

**Size:** M.

## Checkpoint: after task 2

- [x] Everything passes locally and in CI (`checks`, `smoke`, `ci-ok`), and the built server serves
  and switches both languages.

## Task 3: formatting numbers and dates, and closing `i18n`

**Description:** `formatNumber` and `formatDateTime` in `lib/shared/i18n/format.ts`, browser-safe,
in the current language, with the time zone required. This task also closes the work stream.

**Acceptance criteria:**
- [ ] `format.test.ts` runs both inside `paraglideMiddleware` with a request for each language:
  `da` formats as `da`, and `en` as `en-GB`, with the day first and a 24-hour clock.
- [ ] `formatDateTime` follows the zone it is given, not the machine's, and its type refuses a
  call without `timeZone`. Its comment names the zone callers pass as the spec gives it, not
  obzorarr's instance zone.
- [ ] The PR body lists every validation in the spec with its evidence or the PR that holds it.
- [ ] The end-of-work-stream cleanup is done:
  - the rest of the spec's "Docs this module changes when built" list: "locale" to "language" in
    `docs/decisions.md` (D21), `docs/SPEC.md` (the capability-map note and row 2) and `PRODUCT.md`
    ("the operator's language"); row 2 marked **Built.**; the `i18n` line of "Open decisions each
    module closes" removed; D22's "Still to validate" paragraph deleted; the status lines in
    SPEC.md, AGENTS.md and PRODUCT.md updated; SPEC.md's testing section gains `format.test.ts`;
  - `tasks/` is deleted;
  - SPEC-i18n.md is cut to what code and tests can't say, the way obzorarr's #301 cut its spec;
  - the PR body maps every removed requirement to a test, a spec or an owner-approved removal, in
    the same preservation gate table as #301's.

**Verification:** `bun run --bun test`, `check`, `lint`, `build`, `smoke`, prek.

**Dependencies:** tasks 1 and 2.

**Files:** `lib/shared/i18n/format.ts`, `format.test.ts`, `docs/SPEC.md`, `docs/SPEC-i18n.md`,
`docs/decisions.md`, `PRODUCT.md`, `AGENTS.md`, `tasks/`.

**Size:** M.
