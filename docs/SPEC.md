# Spec: comradarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-22) and built. The capability map below is approved; no product module is specified yet.

## Objective

comradarr keeps a perpetual search rotation running over an operator's Sonarr and Radarr libraries:
every item keeps getting searched again, within the indexer budget it inherits (read from Prowlarr
where present). It only sends search commands; it never downloads
([PRODUCT.md](../PRODUCT.md), [legacy spec](product/legacy-spec.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Sonarr, Radarr, Prowlarr or product features. Its
job is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24). Module ids never change. Each module gets
its own `docs/SPEC-<id>.md`, which the owner approves just before it is built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[legacy spec](product/legacy-spec.md) and the [surface briefs](../.impeccable/surfaces/).

**Every module keeps to [Code structure](../AGENTS.md#code-structure).** Its spec names the files it
adds in that layout, and review checks them. In short:
- The same role folders as every edbfi app. A folder exists only once it holds a real file.
- One purpose per file. No `utils`, `helpers`, `common` or `misc` files.
- Group by domain under the role folders. The folder says where; the file name says what.
- Imports only go downwards. Routes, hooks and jobs stay thin and call services.
- Tests sit next to their source.

**Every module writes its text in English and Danish** through `i18n` (D21): no user-facing text in
components or services, and dates and numbers formatted for the viewer's locale.

| # | Module id | Responsibility | Depends on | Surfaces |
|---|---|---|---|---|
| 1 | `secrets` | Encrypts stored secrets (connector API keys, notification channel settings, two-factor secrets, the OIDC client secret) before they reach the database (D20), and the secret wrapper that shows only a redaction marker and opens at named call sites (legacy §11.4) | — | — |
| 2 | `i18n` | The translation groundwork (D21) with Paraglide JS (D22): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's locale, and a check that every message exists in both languages | — | the language switcher in each shell |
| 3 | `setup` | Startup checks, PostgreSQL and its migrations through the owner role, with the app and audit-admin roles it creates and their pre-flight check (D17), runtime settings (legacy §15.1), structured logging with redaction (legacy §15.5), the standard error format (legacy §14.6), security headers and the nonce-based CSP with its report endpoint (ground-floor choice 3, legacy §9.5), the setup gate (legacy §9.2), the bootstrap token with the claim's per-address limit (legacy §9.3), and claiming the instance for its one owner, keeping the origin it was claimed from as the first allowed origin. Also adds the audit trail: its table, the append-only privileges (D7, D16) and the one service every later change writes through, from the first claim attempt (legacy §9.3, §11.6). Replaces `/healthz` with the legacy §15.5 health (ground-floor choice 5) | `secrets`, `i18n` | first-run setup: claim and account (no brief yet); `/healthz` |
| 4 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D20), sessions with their idle and absolute lifetimes, sign-out, the per-address limits and per-username backoff that survive restarts (legacy §10.5), the origin check (the first allowed origin comes from `setup`), secure cookies, password change, the sessions list with revoking (legacy §10.6), recovery (D20), error pages, and the app shell with the sidebar | `setup` | `/login`; the app shell; the Sessions section of `/settings/access` |
| 5 | `two-factor` | Optional but strongly recommended (D20): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D20), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the app shell while it is off | `sign-in` | the two-factor offer in first-run setup; its section of `/settings/access` (no brief yet); the reminder in the app shell |
| 6 | `http-boundary` | Verifying access before it is saved (legacy §9.4 phase 2, §9.5): proxy trust by socket peer, the public origin, allowed origins and hosts, host validation and CORS, each observed, proposed, tested from the operator's own browser and only then saved. A mandatory first-run step after the two-factor offer (D20): until it passes, the setup gate sends every signed-in page back to it (legacy §9.2). The same tests run after setup | `sign-in` | the Verify access step of first-run setup (no brief yet); the Public access section of `/settings/access` |
| 7 | `events` | The in-process event bus and the live stream to the browser (legacy §8.1): server-sent events behind the session cookie, a bounded queue per client, heartbeats, and pages that reload their data when an event arrives. No event carries a secret | `sign-in` | — |
| 8 | `sonarr-provider` | The Sonarr v3 API client (legacy §7, §13): system status and version check, series with season statistics, episodes, quality profiles, episode, season and series searches and command status, with the response limits, strict validation and hostile-response counting of legacy §7.1 | `setup` | — |
| 9 | `radarr-provider` | The Radarr v3 API client (legacy §7, §13): system status and version check, movies, quality profiles, the multi-movie search and command status, with the same limits and validation | `setup` | — |
| 10 | `connectors` | Adding a Sonarr or Radarr connector through the validation pipeline that stops at the first failure (legacy §7.3), with the key encrypted and never shown again; the list with health badges (healthy, degraded, unhealthy, unreachable), detail, editing with a re-check, pausing, deleting with its cascade, the TLS overrides, the connection policy (default, strict or permissive, legacy §7.2), the global no-connector empty state, and the Connect step of first-run setup | `sign-in`, `events`, `sonarr-provider`, `radarr-provider` | `/connectors`; the Connect step of `/setup` |
| 11 | `sync` | The incremental, deep and full syncs with fingerprints, diffs, mappers and tiers computed only here (legacy §4.4, §5), mirror and schedule written in one transaction, the coordinator job, and syncing by hand | `connectors` | "Sync now" and sync progress on `/connectors` |
| 12 | `budgets` | The budget interface and the default budget (legacy §6.4): per connector a daily command cap spread through the day, a concurrency limit and a minimum interval, the compound limit, the read-only budget with the reason for its current limit, and editing the pacing | `connectors` | the pacing section of `/settings/rotation`; the budget block on `/connectors` |
| 13 | `rotation` | The rotation loop in (tier, last searched) order, the Sonarr and Radarr planners with their cover lists (legacy §6.2), dispatch that moves every covered item to the back at once (legacy §6.3), command tracking with re-polling after a restart, pausing and resuming the rotation, the daily-allowance state, and the heartbeat beside the wordmark (legacy §14.4) | `sync`, `budgets` | `/rotation`; the heartbeat in the app shell |
| 14 | `content` | The content browser for 500,000 rows: filters, sorting and search kept in the URL, keyset pages and virtual scrolling (legacy §14.2, §16); item detail with the commands that covered it; "Search now" as a priority search ahead of the rotation (legacy §4.6), and pausing an item | `rotation` | `/content`, `/content/[id]` |
| 15 | `prowlarr-provider` | The Prowlarr v1 API client (legacy §13): indexers with their limits, usage statistics, status, and the applications and tags that map indexers to connectors, read-only. Adds Prowlarr as a connector type | `connectors` | the Prowlarr type on `/connectors` |
| 16 | `indexer-budget` | The budget inherited from Prowlarr (legacy §6.4, §6.5; PRODUCT.md): per connector the most restrictive serving indexer's limit minus the safety reserve (20% by default, which the owner can change) and minus its usage, hourly and daily limits normalised, disabled indexers left out, connector URLs matched to Prowlarr's applications (legacy §17.3), the cached reads, the Prowlarr health monitor, and the local cap kept at or below the inherited budget | `budgets`, `prowlarr-provider` | the inherited budget on `/connectors` and `/settings/rotation` |
| 17 | `dashboard` | The rotation overview from one composed page payload, live-updated: rotation status, items and their tiers, items covered and commands today, the throughput chart, the budget with its reserve shown apart, connector health and indexer warnings | `rotation`, `indexer-budget` | `/dashboard` |
| 18 | `notifications` | Channels (the multi-service relay, the webhook and the guided email form), each tested before it is saved; the routing matrix with its default profile; templates in the tiny template language, with the built-ins translated; delivery with its bounded retries, the 60-second coalescing and the kill switch (legacy §8.2) | `events`, `connectors` | the Notifications page (no brief yet); the routing section of `/settings/rotation` |
| 19 | `audit-log` | The audit log page: newest first, filters, the detail drawer with redacted context and the export, plus the retention setting and the batched, audited sweep under the audit-admin role (legacy §11.6, §17.2) | `sign-in` | `/audit` |
| 20 | `preferences` | Theme (light, dark or system, never flashing the wrong one, legacy §14.5), language, time zone and the install name | `sign-in` | the Preferences section of `/settings/access` |
| 21 | `api-keys` | The owner's API keys (legacy §10.7): a recognisable prefix, shown once, stored as a hash, an optional expiry that is enforced, an optional narrower scope from a fixed list of actions, last used and first use, and revoking. They reach only the JSON API. Also publishes the OpenAPI document behind sign-in (legacy §9.5) | `sign-in` | the API keys section of the settings (no brief yet) |
| 22 | `metrics` | The opt-in metrics endpoint with its allowlist inside the app, answering "not found" while off, and the opt-in trace export to the operator's collector, with connector names as labels but never identity, addresses or user agents (legacy §15.5) | `rotation` | the observability section of the settings (no brief yet) |
| 23 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D20) | `two-factor` | its section of `/settings/access`; its button on `/login` |

Build order: `secrets` → `i18n` → `setup` → `sign-in` → `two-factor` → `http-boundary` → `events` →
`sonarr-provider`, `radarr-provider` → `connectors` → `sync`, `budgets` → `rotation` → `content`,
`prowlarr-provider` → `indexer-budget` → `dashboard` → `notifications`, `audit-log`,
`preferences`, `api-keys`, `metrics`, `oidc-sign-in`. A comma means either order works. The first
five are the opening every edbfi app shares (D20). The first provider built adds the provider
contract and the SSRF-safe outbound HTTP with the URL classification and re-resolution of legacy
§7.2 (D9). `rotation` is the first time comradarr does its job, on the conservative default budget,
so everything before it is the shortest path there; the budget inherited from Prowlarr follows.

First-run setup grows step by step: `setup` claims the instance and creates the owner account,
`two-factor` offers itself, `http-boundary` verifies access, and `connectors` adds the first
connector (D20). Its step list becomes Claim and account, Two-factor, Verify access and Connect
(owner decision; the `/setup` brief lists Claim, Verify access, Account and Connect).

### Where modules live

Paths are under `src/lib/server/`, except those starting with `routes/` (under `src/`) or `lib/`
(under `src/`), and `hooks.server.ts` (`src/hooks.server.ts`). Signed-in pages sit in
`routes/(app)/`, with the app shell as its layout. They follow the
[Code structure](../AGENTS.md#code-structure) layout:

| Module | Main homes |
|---|---|
| `secrets` | `security/secrets/` (the cipher and the secret wrapper); loading the key in `config/` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (Paraglide's settings), `lib/shared/i18n/` (formatting); `paraglideMiddleware` in `hooks.server.ts` |
| `setup` | `db/` (client, migrations, the roles of D17, settings, owner and audit schema), `config/`, `logging/` (with redaction), `services/setup/`, `services/audit/record.ts`, `services/health.ts`, `security/bootstrap-token.ts`, `security/headers.ts`, `lib/shared/errors/` (the error format); `routes/setup/`, `routes/healthz/`, the CSP report endpoint under `routes/api/`, and the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions and their storage, the limit counters, recovery), `db/` session and rate-limit schema, `security/` (session-token and password hashing, origin check); `routes/login/`, `routes/(app)/` layout, the Sessions section of `routes/(app)/settings/access/`, `lib/components/layout/` |
| `two-factor` | `services/two-factor/`, the owner schema's two-factor fields in `db/`; the offer in `routes/setup/`, the challenge page beside `routes/login/`, its section of `routes/(app)/settings/access/`, and the reminder in `lib/components/layout/` |
| `http-boundary` | `services/http-boundary/` (observed values, proposals, live tests), `security/` (client address, host check, CORS), the boundary settings in `db/`; its step in `routes/setup/`, the Public access section of `routes/(app)/settings/access/`, and the resolution in `hooks.server.ts` |
| `events` | `services/events/` (the bus); the stream under `routes/api/`; the listener in `lib/components/layout/` |
| `sonarr-provider` | `providers/sonarr/`, `providers/connector.ts` (the contract, if first), `http/` (if first) |
| `radarr-provider` | `providers/radarr/`, `providers/connector.ts` and `http/` (if first) |
| `connectors` | `services/connectors/` (the validation pipeline, health), `db/` connector schema; `routes/(app)/connectors/`, the Connect step in `routes/setup/` |
| `sync` | `services/sync/`, `db/` mirror, schedule and sync-state schema, `jobs/sync.ts`; its controls on `routes/(app)/connectors/` |
| `budgets` | `services/budgets/` (the interface and the default budget); the pacing section of `routes/(app)/settings/rotation/`, the budget block on `routes/(app)/connectors/` |
| `rotation` | `services/rotation/` (the planners, dispatch, tracking), `db/` planned-command schema, `jobs/rotation.ts`, `jobs/command-tracking.ts`; `routes/(app)/rotation/`, the heartbeat in `lib/components/layout/` |
| `content` | `services/content/`, `db/` priority-search schema; `routes/(app)/content/`, `routes/(app)/content/[id]/` |
| `prowlarr-provider` | `providers/prowlarr/`; the Prowlarr type in `services/connectors/` |
| `indexer-budget` | `services/budgets/prowlarr.ts`, `jobs/indexer-health.ts`; its blocks on `routes/(app)/connectors/` and `routes/(app)/settings/rotation/` |
| `dashboard` | `services/dashboard/` (the composed payload); `routes/(app)/dashboard/` |
| `notifications` | `services/notifications/` (channels, routes, templates, delivery), `db/` notification schema; `routes/(app)/notifications/`, the routing section of `routes/(app)/settings/rotation/` |
| `audit-log` | `services/audit/` (queries, export, retention), `jobs/audit-retention.ts`; `routes/(app)/audit/` |
| `preferences` | `services/preferences/`, `db/` preference schema; the Preferences section of `routes/(app)/settings/access/`, and the theme in `hooks.server.ts` |
| `api-keys` | `services/api-keys/`, `db/` API key schema, `security/api-key.ts` (format and hashing); its settings section under `routes/(app)/settings/`, the key check in `hooks.server.ts`, and the OpenAPI document under `routes/api/` |
| `metrics` | `services/metrics/`; the metrics endpoint under `routes/`, its settings section under `routes/(app)/settings/` |
| `oidc-sign-in` | `services/sign-in/oidc.ts`, the provider settings and the owner's link in `db/`; its callback route beside `routes/login/` |

### Open decisions each module closes

- `secrets`: whether the legacy checks against weak master keys (legacy §11.3: repeated bytes, low
  entropy, a denylist) join every app's key check.
- `i18n`: the validation that D22 lists (pinned versions, the adapter-bun build, a Weblate round
  trip).
- `setup`: D15 (Drizzle versions for Bun SQL), D16 (with the roles of D17), the oldest PostgreSQL
  version (D17) and the logging library half of D14. The backup and restore test of D18 goes with
  the Compose example.
- The first module with a background job closes the job half of D14: `sign-in` if its session
  cleanup is a job, otherwise `sync`.
- `budgets`: whether the daily cap counts a rolling 24 hours or the day in the owner's time zone.
- `indexer-budget`: whether a disabled indexer leaves the budget at once or after a debounce
  (legacy §6.4, §17.3).
- `content`: whether used priority searches are deleted or marked (legacy §17.2).
- `notifications`: what delivers the multi-service relay (a new dependency, so the owner approves
  it) and whether email stays a guided relay form (legacy §17.2).
- `metrics`: the trace export library (a new dependency, so the owner approves it).
- D13: the first JSON endpoint that needs a generated client decides it, at the latest `api-keys`,
  which publishes the OpenAPI document. D19 stays open as an accepted limit.

### Left out on purpose

- Any role beyond the one owner, the permission matrix and users created by a provider (legacy §3,
  §10.3, §10.4; D20). API key scopes keep a fixed list of actions.
- Signing in through a reverse proxy's headers (legacy §10.3; D20): `oidc-sign-in` covers the same
  identity providers.
- More than one OIDC provider, and linking by email (legacy §10.4): D20 links one provider by
  issuer and subject.
- Turning password sign-in off (legacy §10.1; owner decision; D20: the password keeps working).
- Configuration snapshots (legacy §12; owner decision): backup goes through PostgreSQL and the
  master key (D17).
- The setup-claim cookie and the token file (legacy §9.1): claiming and creating the owner is one
  step, and the token is printed only to the console (D20).
- PostgreSQL inside the app image, its supervised processes and a built-in backup command (legacy
  §2.2, §15.2, §15.4; D4, D17).
- Connecting Weblate and hiding incomplete languages (legacy §14.7; D21): later work. The message
  files are ready for it.
- What the legacy design deferred on purpose (legacy §17.3): a hash-chained audit, the key-rotation
  worker, a command palette, per-connector hostile-response thresholds and pre-upgrade dumps.
- Downloading, managing files, reading download queues, querying indexers and artwork (PRODUCT.md,
  principle 3; legacy §1.4).

### Surfaces with no brief yet

First-run setup's claim and account, two-factor and Verify access steps, the two-factor and OIDC
sections and password change on `/settings/access`, the Notifications page, and the API keys and
observability settings are needed (all are in the legacy design or in PRODUCT.md's sidebar) but have
no brief. The `/setup` brief's step list changes to the order above. Each gets its brief, or its
brief's change, before its module is specced.

## Tech stack

The stack decisions are in [decisions.md](decisions.md). Versions are exact pins in
`package.json` (Bun from its `packageManager` field) and `bun.lock`; Dependabot moves them. Every
package is a dev dependency, so adapter-bun bundles it and `bun ./build` needs no `node_modules`.

| Part | Package |
|---|---|
| Runtime and package manager | Bun |
| Language | `typescript` (6.x) |
| UI framework | `svelte` / `@sveltejs/kit` |
| Build | `vite` / `@sveltejs/vite-plugin-svelte` |
| Adapter | `@sveltejs/adapter-bun` |
| Styling | `@pandacss/dev`, `@pandacss/vite` (its Vite plugin), `@pandacss/preset-base` |
| Primitives | `@ark-ui/svelte` |
| Type check | `svelte-check` |
| Unit tests | `vitest` (`node` environment); `happy-dom` joins with the first component test |
| e2e | `@playwright/test` (Chromium) |
| Lint and format | `@biomejs/biome` |

The database is PostgreSQL as a separate service through Drizzle and Bun SQL (D5). It arrives with
`setup`, not here; it runs in its own container, and the app creates its own roles (D17).

Setup facts for this stack:
- SvelteKit 3 is configured through its Vite plugin (`vite.config.ts`); there's no
  `svelte.config.js`. `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Package subpath imports replace `$lib` and need explicit file targets: `#lib/*` maps to
  `./src/lib/*` and imports name the file with its extension (`#lib/server/services/health.ts`);
  `#styled-system/*` maps to the generated `./styled-system/*/index.js`.
- `svelte-kit sync` runs before Panda's codegen, in `prepare` and in `check`.
- The Panda Vite plugin appends the generated CSS to the stylesheet that declares the layer order
  (`src/app.css`), and `transform: true` turns static `css()` calls into class strings at build
  time.
- Hook types come from `@sveltejs/kit/hooks`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server |
| `bun run --bun build` | production build through adapter-bun into `build/` |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`) |
| `bun run --bun check` | `svelte-kit sync`, Panda codegen, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e smoke; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome check` |
| `prek run --all-files --hook-stage manual` | everything CI's `checks` job runs |

## Project structure

The folder tree is in [AGENTS.md](../AGENTS.md#structure) and its rules in
[Code structure](../AGENTS.md#code-structure).

## Code style

Biome's defaults with the shared `biome.json` (tabs, double quotes, 100 columns). TypeScript strict;
`#lib/…` imports. File names and layout follow
[Code structure](../AGENTS.md#code-structure).

```ts
import { healthResponse } from "#lib/server/services/health.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => healthResponse();
```

## Design tokens

- [`panda.config.ts`](../panda.config.ts) holds every design token: colours, type styles,
  spacing, radii, layout sizes, breakpoints and motion durations, under the names DESIGN.md uses.
  It replaced the seed token files that came with the design package.
- Colours are semantic tokens behind a colour-mode condition (`_dark`), dark by default
  (`class="dark"` on `<html>` in `src/app.html`); light values can be added later without touching
  components.
- Only `@pandacss/preset-base` is loaded (utilities and conditions), so no preset palette competes
  with the app's tokens, and `strictTokens` makes a raw value in `css()` a type error that `check`
  reports.
- The placeholder page uses only Panda tokens: no raw colour, size or font values in components. Its
  heading uses the `h1` style; the `display` style stays for the surfaces DESIGN.md gives it.

## Testing strategy

- **Unit (Vitest, `node` environment):** one test, for the `/healthz` handler: status 200, body
  `ok`, `cache-control: no-store`. Component tests use happy-dom when components exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** one smoke test against the built adapter-bun server.
  It checks that `/` returns 200, shows the placeholder heading, hydrates (it waits for the
  `data-hydrated` attribute the root layout sets when mounted), applies the Panda background token
  and `h1` text style and logs no console errors, and that `/healthz` returns `ok`.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds and runs the smoke test.

## CI and repo tooling

comradarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke) and `audit`
  (outside PRs); `checks` and `smoke` sit behind `ci-ok`, every job that installs runs with failing
  `node`, `npm` and `npx` on `PATH`, and the weekly run is `4 5 * * 0`.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit` and `bun`, and
  `.github/workflows/biome-migrate.yml` applies Biome migrations to Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Sonarr, Radarr, Prowlarr or any product feature; a second
  styling tool or primitive library; Node, npm or npx anywhere, including CI.

## Success criteria

1. A fresh clone passes `bun ci`, `bun run --bun check` (zero errors and warnings), `bun run --bun
   test`, `bun run --bun build`, `bun run --bun smoke` and `prek run --all-files --hook-stage
   manual`, with no Node on `PATH`.
2. The built server (`bun ./build`) serves `/` with the placeholder page and `/healthz` with `ok`.
3. `panda.config.ts` holds every design token; the seed token files are gone, and nothing in `src/`
   uses a raw colour, size or font value.
4. Only folders with real files exist; `#lib` resolves in app code, tests and `svelte-check`.
5. CI on the PR runs `checks`, `smoke` and `ci-ok` green; `audit` runs outside PRs.

## Ground-floor choices

Choices 1–3 were settled for the first rewrite app's skeleton and are reused here, since comradarr's
design doesn't call for anything different; choices 4 and 5 are comradarr's own.

1. **Fonts.** DESIGN.md wants Source Sans 3 and IBM Plex Mono from locally bundled files, not remote
   font requests. The skeleton defines the font tokens with system fallbacks; the first surface adds
   the font files (a dependency the owner approves then).
2. **Ark UI before its first use.** The skeleton installs `@ark-ui/svelte`, so the Panda and Ark
   pairing and `check-peers` are settled early; the first `ui/` wrapper comes with the first surface
   that needs one.
3. **Security headers and CSP.** The legacy spec makes security headers and a strict nonce-based CSP
   always on, with a report endpoint (§9.5). They belong to the first module that serves real pages
   (`setup`, whose claim page comes before `sign-in`), not the skeleton.
4. **Where the icon lives.** SvelteKit serves static files from `static/`, so the icon is
   `static/comradarr-icon.svg` (it was in `public/`), which the README shows and `src/app.html` uses
   as the favicon, the layout the other rewrite apps use.
5. **Health.** `/healthz` always answers `ok`. The module that adds the database replaces it with
   legacy spec §15.5's health: unauthenticated and minimal, overall and per-component status,
   healthy or degraded as success and unavailable when a critical component is down.
