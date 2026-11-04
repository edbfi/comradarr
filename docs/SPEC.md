# Spec: comradarr

**Status:** the ground floor (skeleton) is specified here, approved by the orchestrator
(2026-10-22) and built. The capability map below is approved; module 1, `secrets`, is built
([SPEC-secrets.md](SPEC-secrets.md)).

## Objective

comradarr keeps a perpetual search rotation running over an operator's Sonarr and Radarr libraries:
every item keeps getting searched again, within the indexer budget it inherits (read from Prowlarr
where present). It only sends search commands; it never downloads
([PRODUCT.md](../PRODUCT.md)).

**This spec covers only the ground floor:** an empty, production-shaped SvelteKit app that builds,
type-checks, tests, lints and serves on Bun, styled from the design tokens, with the edbfi Bun web
CI around it. It has no database, authentication, Sonarr, Radarr, Prowlarr or product features. Its
job is to make the first module spec cheap to build: every later PR adds behaviour, not plumbing.

## Capability map

**Status:** approved by the owner (2026-10-24; shared rows aligned 2026-10-30). Module ids never
change. Each module gets its own `docs/SPEC-<id>.md`, which the owner approves just before it is
built.
Sources: [PRODUCT.md](../PRODUCT.md), [decisions.md](decisions.md), the
[surface briefs](../.impeccable/surfaces/) and the [Module notes](#module-notes) below.

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
| 1 | `secrets` | **Built.** Encrypts stored secrets (connector API keys, notification channel settings, two-factor secrets, the OIDC client secret) before they reach the database (D20), and the secret wrapper that shows only a redaction marker and opens at one named call | — | — |
| 2 | `i18n` | The translation groundwork (D21) with Paraglide JS (D22): message files in English and Danish, choosing each request's language, the language switcher, formatting dates and numbers for the viewer's locale, and a check that every message exists in both languages | — | the language switcher in each shell |
| 3 | `setup` | Startup checks, database and migrations, runtime settings, structured logging with redaction, security headers and the nonce-based CSP (ground-floor choice 3), the setup gate, the bootstrap token, printed to the console and never through the stored logs, and claiming the instance for its one owner. comradarr adds PostgreSQL as that database, with migrations through the owner role, the app and audit-admin roles it creates and their pre-flight check (D17); the standard error format; the CSP's report endpoint; the claim's per-address limit; the audit trail: its table, the append-only privileges (D7, D16) and the one service every later change writes through, from the first claim attempt; and the health check with per-component status in place of `/healthz` (ground-floor choice 5) | `secrets`, `i18n` | first-run setup: claim and account (no brief yet); `/healthz` |
| 4 | `sign-in` | Owner sign-in with username and password, signing the new owner in at the claim (D20), sessions, sign-out (POST only), rate limits, the cross-origin check (it asks the browser, stores no address and takes `ORIGIN` as an optional override), app-named cookies that work over plain HTTP at home and behind an HTTPS proxy, password change, error pages, recovery (D20), and the app shell with the sidebar. comradarr adds the sessions' idle and absolute lifetimes, per-address limits and per-username backoff that survive restarts, and the sessions list with revoking | `setup` | `/login`; the app shell; the Sessions and Password sections of `/settings/access` |
| 5 | `two-factor` | Optional but strongly recommended (D20): authenticator codes, backup codes and the challenge after every way the owner signs in (except the optional OIDC skip, D20), with replay protection and a limit on failed attempts. Recovery turns it off. Adds the offer to first-run setup, right after the owner account is created and before any connection step, and the reminder in the app shell while it is off | `sign-in` | the two-factor offer in first-run setup; its section of `/settings/access` (no brief yet); the reminder in the app shell |
| 6 | `http-boundary` | Verifying access from the operator's own browser: proxy trust by socket peer, observed, proposed, tested there and only then saved; and the address check, which only diagnoses: comparing the address the browser uses with the `Host` the app receives, `ORIGIN` when set and the forwarded address, classifying the forwarded headers and the source address, suggesting `ORIGIN=<address>` or the proxy line `proxy_set_header Host $http_host`, and the header recipes for common reverse proxies. The address check never blocks and saves nothing, and its suggestion also shows on the claim and owner sign-in pages, so someone without a session can recover. A mandatory first-run step after the two-factor offer (D20): until it passes, the setup gate sends every signed-in page back to it; the address check never stops it passing. The same tests run after setup | `sign-in` | the Verify access step of first-run setup (no brief yet); the Public access section of `/settings/access`; the address hint on the claim and owner sign-in pages |
| 7 | `events` | The in-process event bus and the live stream to the browser: server-sent events behind the session cookie, a bounded queue per client, heartbeats, and pages that reload their data when an event arrives. No event carries a secret | `sign-in` | — |
| 8 | `sonarr-provider` | The Sonarr v3 API client: system status and the version check against the latest stable release (D23), series with season statistics, episodes, quality profiles, episode, season and series searches and command status, with the response limits, strict validation and hostile-response counting | `setup` | — |
| 9 | `radarr-provider` | The Radarr v3 API client: system status and the version check against the latest stable release (D23), movies, quality profiles, the multi-movie search and command status, with the same limits and validation | `setup` | — |
| 10 | `connectors` | Adding a Sonarr or Radarr connector through the validation pipeline that stops at the first failure, with the key encrypted and never shown again; the list with health badges (healthy, degraded, unhealthy, unreachable), detail, editing with a re-check, pausing, deleting with its cascade, the TLS overrides, the connection policy (default, strict or permissive), `http://` only for local addresses with an opt-in per URL (owner rule), the global no-connector empty state, and the Connect step of first-run setup | `sign-in`, `events`, `sonarr-provider`, `radarr-provider` | `/connectors`; the Connect step of `/setup` |
| 11 | `sync` | The incremental, deep and full syncs with fingerprints, diffs, mappers and tiers computed only here, mirror and schedule written in one transaction, the coordinator job, and syncing by hand | `connectors` | "Sync now" and sync progress on `/connectors` |
| 12 | `budgets` | The budget interface and the default budget: per connector a daily command cap spread through the day, a concurrency limit and a minimum interval, the compound limit, the read-only budget with the reason for its current limit, and editing the pacing | `connectors` | the pacing section of `/settings/rotation`; the budget block on `/connectors` |
| 13 | `rotation` | The rotation loop in (tier, last searched) order, the Sonarr and Radarr planners with their cover lists, dispatch that moves every covered item to the back at once, command tracking with re-polling after a restart, pausing and resuming the rotation, the daily-allowance state, and the heartbeat beside the wordmark | `sync`, `budgets` | `/rotation`; the heartbeat in the app shell |
| 14 | `content` | The content browser for 500,000 rows: filters, sorting and search kept in the URL, keyset pages and virtual scrolling; item detail with the commands that covered it; "Search now" as a priority search ahead of the rotation, and pausing an item | `rotation` | `/content`, `/content/[id]` |
| 15 | `prowlarr-provider` | The Prowlarr v1 API client: indexers with their limits, usage statistics, status, and the applications and tags that map indexers to connectors, read-only. Adds Prowlarr as a connector type | `connectors` | the Prowlarr type on `/connectors` |
| 16 | `indexer-budget` | The budget inherited from Prowlarr (PRODUCT.md): per connector the most restrictive serving indexer's limit minus the safety reserve (20% by default, which the owner can change) and minus its usage, hourly and daily limits normalised, disabled indexers left out, connector URLs matched to Prowlarr's applications, the cached reads, the Prowlarr health monitor, and the local cap kept at or below the inherited budget | `budgets`, `prowlarr-provider` | the inherited budget on `/connectors` and `/settings/rotation` |
| 17 | `dashboard` | The rotation overview from one composed page payload, live-updated: rotation status, items and their tiers, items covered and commands today, the throughput chart, the budget with its reserve shown apart, connector health and indexer warnings | `rotation`, `indexer-budget` | `/dashboard` |
| 18 | `notifications` | Channels (the multi-service relay, the webhook and the guided email form), each tested before it is saved; the routing matrix with its default profile; templates in the tiny template language, with the built-ins translated; delivery with its bounded retries, the 60-second coalescing and the kill switch | `events`, `connectors` | the Notifications page (no brief yet); the routing section of `/settings/rotation` |
| 19 | `audit-log` | The audit log page: newest first, filters, the detail drawer with redacted context and the export, plus the retention setting and the batched, audited sweep under the audit-admin role | `sign-in` | `/audit` |
| 20 | `preferences` | Theme (light, dark or system, never flashing the wrong one), language, time zone and the install name | `sign-in` | the Preferences section of `/settings/access` |
| 21 | `api-keys` | The owner's API keys: a recognisable prefix, shown once, stored as a hash, an optional expiry that is enforced, an optional narrower scope from a fixed list of actions, last used and first use, and revoking. They reach only the JSON API. Also publishes the OpenAPI document behind sign-in | `sign-in` | the API keys section of the settings (no brief yet) |
| 22 | `metrics` | The opt-in metrics endpoint with its allowlist inside the app, answering "not found" while off, and the opt-in trace export to the operator's collector, with connector names as labels but never identity, addresses or user agents | `rotation` | the observability section of the settings (no brief yet) |
| 23 | `oidc-sign-in` | Connecting one OpenID Connect provider (Authentik, Authelia, Pocket ID, Tinyauth and others) by its issuer, client id and secret, and linking the owner's account to it, after which it signs them in as the owner, and offering to skip `two-factor` when the provider's `amr` claim reports its own second factor (D20) | `two-factor` | its section of `/settings/access`; its button on `/login` |

Build order: `secrets` → `i18n` → `setup` → `sign-in` → `two-factor` → `http-boundary` → `events` →
`sonarr-provider`, `radarr-provider` → `connectors` → `sync`, `budgets` → `rotation` → `content`,
`prowlarr-provider` → `indexer-budget` → `dashboard` → `notifications`, `audit-log`,
`preferences`, `api-keys`, `metrics`, `oidc-sign-in`. A comma means either order works. The first
five are the opening every edbfi app shares (D20). The first provider built adds the provider
contract and the SSRF-safe outbound HTTP with its URL classification and re-resolution (D9;
Module notes, `connectors`). `rotation` is the first time comradarr does its job, on the
conservative default budget,
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
| `secrets` | `security/secrets/` (key checks, keyring, cipher, `Secret`), `config/secret-key.ts`, `src/env.ts` and the `init` hook in `hooks.server.ts` |
| `i18n` | `messages/en.json` and `messages/da.json`, `project.inlang/` (Paraglide's settings), `lib/shared/i18n/` (formatting); `paraglideMiddleware` in `hooks.server.ts` |
| `setup` | `db/` (client, migrations, the roles of D17, settings, owner and audit schema), `config/`, `logging/` (with redaction), `services/setup/`, `services/audit/record.ts`, `services/health.ts`, `security/bootstrap-token.ts`, `security/headers.ts`, `lib/shared/errors/` (the error format); `routes/setup/`, `routes/healthz/`, the CSP report endpoint under `routes/api/`, and the setup gate and the headers in `hooks.server.ts` |
| `sign-in` | `services/sign-in/` (sessions and their storage, the limit counters, recovery), `db/` session and rate-limit schema, `security/` (session-token and password hashing, the cross-origin check), `vite.config.ts` (SvelteKit's own form check off); the sign-in at the claim in `routes/setup/`, `routes/login/`, `routes/(app)/` layout, the Sessions and Password sections of `routes/(app)/settings/access/`, `lib/components/layout/` |
| `two-factor` | `services/two-factor/`, the owner schema's two-factor fields in `db/`; the offer in `routes/setup/`, the challenge page beside `routes/login/`, its section of `routes/(app)/settings/access/`, and the reminder in `lib/components/layout/` |
| `http-boundary` | `services/http-boundary/` (observed values, proposals, live tests, the address check), `security/` (client address, host check, CORS), the boundary settings in `db/`; its step in `routes/setup/`, the address hint on the claim in `routes/setup/` and on `routes/login/`, the Public access section of `routes/(app)/settings/access/`, and the resolution in `hooks.server.ts` |
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

- `i18n`: the validation that D22 lists (pinned versions, the adapter-bun build, a Weblate round
  trip).
- `setup`: D15 (Drizzle versions for Bun SQL), D16 (with the roles of D17), the oldest PostgreSQL
  version (D17) and the logging library half of D14; and how the inline `style` attributes that Ark
  UI and Svelte write fit the content security policy, which allows no `unsafe-inline`. The backup
  and restore test of D18 goes with the Compose example.
- `sign-in`: how long an owner session lasts.
- `sign-in`: the password rules: the minimum length, whether a list of common passwords is
  refused, and how repeated failed sign-ins are slowed beyond the rate limits (backoff, or a lockout
  where the app's approved docs allow one).
- The first module with a background job closes the job half of D14: `sign-in` if its session
  cleanup is a job, otherwise `sync`.
- `budgets`: whether the daily cap counts a rolling 24 hours or the day in the owner's time zone.
- `indexer-budget`: whether a disabled indexer leaves the budget at once or after a debounce; and
  how a connector is matched to its Prowlarr application when one names a container and the other
  an IP address (normalising both, or letting the owner choose).
- `content`: whether used priority searches are deleted or marked.
- `notifications`: what delivers the multi-service relay (a new dependency, so the owner approves
  it) and whether email stays a guided relay form.
- `metrics`: the trace export library (a new dependency, so the owner approves it).
- D13: the first JSON endpoint that needs a generated client decides it, at the latest `api-keys`,
  which publishes the OpenAPI document. D19 stays open as an accepted limit.

### Left out on purpose

- Any role beyond the one owner, the permission matrix and users created by a provider (D20). API
  key scopes keep a fixed list of actions.
- Signing in through a reverse proxy's headers (D20): `oidc-sign-in` covers the same
  identity providers.
- More than one OIDC provider, and linking by email: D20 links one provider by
  issuer and subject.
- Turning password sign-in off (owner decision; D20: the password keeps working).
- Configuration snapshots (owner decision): backup goes through PostgreSQL and the
  master key (D17).
- The legacy app's setup-claim cookie and token file: claiming and creating the owner is one step,
  and the token is printed only to the console (D20).
- PostgreSQL inside the app image, its supervised processes and a built-in backup command (D4,
  D17).
- **A container image's first start** (deferred; comradarr has no image repository yet). If it
  gets one, its setup script never generates a master key: PostgreSQL is a separate service the
  image can't inspect, so a first install can't be told from an existing one, and a new key would
  derive the wrong role passwords (D17). The operator always sets `COMRADARR_SECRET_KEY` or
  `COMRADARR_SECRET_KEY_FILE`. Building images through GitHub is a later goal.
- Connecting Weblate and hiding incomplete languages (D21): later work. The message
  files are ready for it.
- What the legacy app's design deferred on purpose: a hash-chained audit, the key-rotation
  worker, a command palette, per-connector hostile-response thresholds and pre-upgrade dumps.
- Downloading, managing files, reading download queues, querying indexers and artwork (PRODUCT.md,
  principle 3).

### Surfaces with no brief yet

First-run setup's claim and account, two-factor and Verify access steps, the two-factor and OIDC
sections and password change on `/settings/access`, the Notifications page, and the API keys and
observability settings are needed (all are in the Module notes or in PRODUCT.md's sidebar) but have
no brief. The `/setup` brief's step list changes to the order above. Each gets its brief, or its
brief's change, before its module is specced. The `/login` brief gains `http-boundary`'s address
hint (`sign-in`) the same way, and the `/settings/access` brief's Public access gains proxy trust,
below the address check, with the same Observed, Proposed, Testing and Verified states.

### Module notes

What a capability-map row commits to in more detail than a clause fits, adapted to the decisions.
It is behaviour to keep unless the module's approved spec or a decision changes it. Layout,
placement, visuals and exact wording are not behaviour: where a note describes them, DESIGN.md and
the surface's brief win, and for a surface with no brief yet the note is only a starting point for
that brief. Each block moves into its module's `SPEC-<id>.md` when that module is specced. Rate
limits are listed once, under `sign-in`. `i18n`, `setup` and `sign-in` are shared with the other
edbfi apps (D20): a bullet or clause marked "(comradarr)" is this app's own, and the rest is the
shared wording; a "(comradarr)" mark inside a bullet covers the rest of that bullet, and
"(comradarr: …)" only its own parentheses. Decision numbers are comradarr's.

#### i18n

- A number in a message that states how the app behaves (a limit, a duration, a count) is passed in
  as a parameter from the constant the logic uses, never written into the text, so the copy can't
  drift from the behaviour.

#### setup

- **The setup gate.** Until first run is complete, every page except static assets, the claim,
  sign-in and first run's own helpers sends the browser to the current first-run step. The server
  keeps one current-step pointer: the browser can't skip ahead, each step's action checks that it is
  the current step, and a step that offers Previous only moves the pointer back. Only the last
  step's action completes first run. (comradarr) The pointer is stored and compared exactly: any
  change to setup state, creating the owner included, writes it as not complete, so an interrupted
  first run is still gated after a restart, and nothing is inferred from an owner account existing.
  Until first run is complete, JSON callers get a 503 "setup incomplete", never a 401, and the only
  routes open without a session are setup's own, the health check, the CSP report endpoint and the
  static assets setup needs; the OpenAPI document isn't one of them. Until Verify access passes,
  every signed-in page goes back to it (`http-boundary`, D20).
- **The bootstrap token** (D20) is 12 random lowercase letters and digits, shown as
  `xxxx-xxxx-xxxx`, held only in memory (never logged or stored) and compared in constant time. It
  is printed with the setup URL and is valid for 15 minutes, after which a new one is printed. Claim
  attempts are rate-limited (`sign-in`). (comradarr) It is printed only while the instance is
  unclaimed, in a banner on the console that also gives its expiry time and warns that the console
  output is a setup secret, not to be pasted into chats or issue trackers. The setup URL carries the
  token, with an all-interfaces address shown as `localhost`; the setup page fills the token in and
  removes it from the address bar at once, so it never reaches the history or a referrer. A restart
  prints a new token.
- **The claim** is a POST, cross-origin-checked like any other (`sign-in`), and it stores no
  address. It needs a valid bootstrap token and the browser's address (`sign-in`). Using up the
  token and creating the owner are one atomic step, and the owner session it starts follows
  `sign-in`'s cookies. (comradarr) Every claim attempt is audited with its outcome (granted, wrong
  token, expired, rate-limited), and setup's endpoints never log request bodies.
- **Runtime settings** (comradarr). The environment holds only what must exist before the start: the
  master key and the database URL (D17), the log level and format (structured lines by default,
  console lines for development), the content security policy's report-only mode (for development,
  with a warning at every start), recovery (D20) and `ORIGIN`. Every other setting is stored in
  PostgreSQL, changed in the app, audited and in effect at once, and a network setting is tested
  before it is saved (`http-boundary`). There are no configuration files. Plain settings and secrets
  are stored apart: a secret is encrypted in its own field (`secrets`), so reading plain settings
  never decrypts anything.
- **Database** (comradarr). Every query is parameterised; no SQL is built from strings.
- **Logging.** Four levels; debug entries are dropped unless debug logging is on. Each entry has a
  level, a message, a source, structured metadata and a millisecond timestamp, and goes to standard
  output (D12). Redaction runs before an entry is written anywhere: credentials in URLs, token-like
  query parameters, token, authorisation and cookie fields in payloads and headers, and, at any
  depth, any metadata key that looks like a token, secret, password, cookie, session or key.
  (comradarr) Also redacted: the API-key header, secret-shaped values (password hashes, three-part
  tokens, the API-key prefix pattern, encrypted values) and wrapped secrets (`secrets`). Debug is
  internal state, info is routine events (a sync finished with its counts, a rotation tick's
  summary, a request with its method, its path with query values stripped, status, size, time and
  client address), warning is a recoverable surprise and error an actual failure; there is no fatal
  level, because an unrecoverable condition exits. Context such as the connector, the sync type or
  the request id is bound once per boundary, and event names form a hierarchy that is easy to
  search. A loop logs one summary per tick, and a repeated error is logged once when it starts, then
  rarely, then once when it clears. Request and response bodies are never logged, and an exception
  is logged as its type, message, relevant frame and fingerprint, never its local variables. Who
  changed what goes to the audit trail, not the log.
- **The audit trail** (comradarr). One service writes every entry, from the first claim attempt on.
  An entry has its time, an action code from one documented list that only grows, the actor (the
  owner, or the client address when nobody is signed in), a context of a fixed shape per action with
  every secret redacted, the client address, the user agent and the request id, which links it to
  the request's log lines. Entries are read newest first, overall and per action. It records the
  bootstrap token being printed; every claim attempt and its outcome; creating the owner; completing
  first run; every sign-in attempt with its method; sign-out; ending sessions; password changes;
  recovery; creating, first using and revoking API keys; adding, editing, deleting, pausing and
  resuming connectors (the URL and type, and only that the key changed, never the key);
  `http-boundary` changes with old and new values; OIDC settings; notification channels, routes and
  templates; settings and secret changes; and syncs and searches started by hand. Routine sync and
  rotation ticks, health probes, single dispatches and single notification deliveries go to the log
  instead; an action is recorded in exactly one of the two. Startup checks that the database knows
  every action code.
- **Security headers,** on every response, early returns included: framing denied, no MIME sniffing,
  a referrer policy of `same-origin` or `strict-origin-when-cross-origin`, never `no-referrer`
  (which makes browsers send `Origin: null` on the app's own form posts), a permissions policy
  denying camera, microphone and geolocation (comradarr: and every other device feature the app
  doesn't use), one-year strict transport security over HTTPS (known when `ORIGIN` is `https`, or
  when the browser sent `Sec-Fetch-Site` to a host that isn't loopback, since browsers send it only
  to HTTPS and loopback addresses), and a nonce-based content security policy: scripts from the app
  only; images from the app and inline data; fonts from the app (DESIGN.md bundles them);
  connections to the app only; no framing; the app only as base and form target. (comradarr) Strict
  transport security covers subdomains and is never preloaded, which is the operator's choice.
  Opener and resource policies are same-origin, and no server-version or powered-by header is sent.
  The policy's default is the app only, styles too come from the app with the nonce, plugins are
  refused, `unsafe-inline` and `unsafe-eval` are never allowed (which limits the dependencies the
  app can use), and `upgrade-insecure-requests` isn't sent, because it would break a plain-HTTP
  install at home.
- **The CSP report endpoint** (comradarr) needs no session and works before setup. It takes only the
  report content type, up to a size cap, is rate-limited per address, logs each violation with
  bounded context, and silently drops anything it doesn't accept, so a prober learns nothing.
- **Health** (comradarr) replaces `/healthz`'s fixed answer: no session needed, minimal, the overall
  and per-component status with no versions or timings; healthy or degraded answers success, and
  unavailable when a critical component, such as the database, is down.
- **The error format** (comradarr). Every error has one structured shape: a stable type id that is
  also its message key, a title, the status, a translated detail, the request id, per-field errors
  for a validation failure, the domain context, and for a connector error whether a retry can help.
- **Startup and shutdown.** Startup runs once, before any request is served: migrations (D5), then
  each module's startup work, then starting the jobs; a job that fails to start is logged, not
  fatal. Shutdown stops the jobs, flushes the logs and drains open requests and live streams for a
  bounded time, then exits even if an upstream call is still outstanding. Streams it closes end
  cleanly, so browsers reconnect. A second signal exits at once, and a hang-up counts as a stop. The
  environment sets the drain time (default 30 seconds, kept below the container's stop timeout).
  (comradarr) Migrations run as the owner role after its pre-flight check (D17); the token is
  printed next if the instance is unclaimed; jobs do nothing until first run is complete. Migrations
  only go forward: a failed one stops startup with a clear message and a non-zero exit, a pending
  one logs a reminder to back up first, and going back means restoring that backup and running the
  previous version, never running an older version on a migrated database. A job catches every error
  in a tick, logs it with its context and carries on; a lasting failure shows as a deduplicated
  error and a health badge, not as restarts. Everything that matters is in the database, so a crash
  loses nothing: sync resumes from its timestamps and fingerprints, rotation from the last-searched
  times, and commands in flight are polled again.
- **Trust:** anyone who can read the server console can claim a fresh install. (comradarr)
  Restarting the app needs the same trust, so a restart printing a new token adds nothing.

#### sign-in

- **Request order** (startup has already finished in SvelteKit's `init` hook): the cross-origin
  check, rate limits, sign-in, the setup gate, then the owner check. Security headers go on every
  response, an early return from any stage included. (comradarr) The client address is resolved
  once, before the first stage (`http-boundary`), and every stage, the audit trail and the logs read
  the same one.
- **SvelteKit's own form check is off:** `sveltekit({ csrf: { trustedOrigins: ['*'] } })` in
  `vite.config.ts` (SvelteKit 3 takes its options in the `sveltekit()` call, with no `kit:`
  wrapper). Remote functions stay off. A config test asserts both, so SvelteKit's only remaining
  check before `handle` is the remote-function one, which nothing uses. The cross-origin check
  replaces SvelteKit's form check.
- **The cross-origin check** asks the browser, so the app doesn't need to know its own address and
  stores none. It runs first in `handle` for every method except GET, HEAD and OPTIONS, and for
  every content type (form, JSON, multipart, `text/plain`, empty). Internal `event.fetch`
  subrequests (`event.isSubRequest`) skip it. (comradarr: it replaces the legacy app's origin check
  against a stored list and its exemptions; the claim and the CSP report endpoint are checked like
  any other POST, and a request with an API key passes without browser headers only as a machine
  route, below.)
  - An `Origin` header, whenever it is present, must parse as one bare `http` or `https` origin;
    `null`, a malformed value or several values are refused. This applies on every branch below.
  - With `ORIGIN` set, a present `Origin` must equal `ORIGIN`, compared as parsed origins. Without
    `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
  - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`
    (`same-site` and `cross-site` are refused). Otherwise `Origin`'s host and port must equal the
    `Host` header, with default ports normalised. Browsers send `Sec-Fetch-Site` only to HTTPS,
    `localhost` and loopback addresses, so over plain HTTP outside loopback every browser gets
    this comparison.
  - A request with neither `Origin` nor `Sec-Fetch-Site` doesn't come from a browser. It passes only
    on an explicit list of machine routes (comradarr: the JSON API, with a valid API key; API keys
    reach only the JSON API, D20): the API-key endpoints and other machine routes the app's
    approved docs already name, each with the credentials those docs require. The session cookie is
    never honoured on it: such a request that carries only a session cookie gets a 403.
  - A refusal is a 403 with the app's own "Access denied" page, or a JSON error for JSON callers,
    with the security headers and in the viewer's language.
- **The browser's address** is `ORIGIN` when it is set, and otherwise the validated `Origin` of the
  POST that passed the cross-origin check. It decides the cookies' `Secure` flag and the OIDC
  `redirect_uri`. Every POST that sets or deletes a cookie needs it, such as the claim, sign-in, the
  two-factor challenge, recovery, sign-out and the start of OIDC sign-in: when a browser stripped
  `Origin`, they get a 403 that says so (the "Access denied" page, or a JSON error for JSON
  callers). OIDC sign-in keeps the address in the flow's state. The OIDC callback address is saved
  when the owner configures OIDC, and must match. Links shown on GET pages for copying, such as the
  OIDC callback to register, are built in the browser from the address the user is on, or from
  `ORIGIN` when it is set. App code never uses `event.url.origin` or `event.url.protocol` for
  security, cookies or rendered URLs, which a test that searches the code enforces, and redirects
  stay relative.
- **The address hint:** when `ORIGIN` is set and doesn't match the address the browser is on, or
  when `ORIGIN` is unset and that address's host and port don't match the `Host` header, the claim
  and owner sign-in pages suggest setting `ORIGIN=<that address>` (or removing a wrong `ORIGIN`) or
  adding the proxy line `proxy_set_header Host $http_host`, so someone without a session can
  recover. (comradarr) `http-boundary` adds it, with the check behind it.
- **`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name (an
  app prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
  variable). When set, it must be a bare `http` or `https` origin (a trailing `/` is fine; no path,
  query, fragment or credentials), compared as a parsed origin, or startup stops with an error that
  doesn't echo the value. adapter-bun 1.0.0 ignores `ORIGIN`; from 1.0.1 a set `ORIGIN` also
  corrects SvelteKit's `event.url`, and an empty `ORIGIN=""` throws with the value in the message,
  so a container image's entrypoint unsets an empty `ORIGIN` and its templates leave it out (the
  image's work, not this repo's; comradarr has none yet).
- **When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
  HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
  16.4, Firefox before 90, Chrome before 76). The proxy fix is `proxy_set_header Host $http_host`
  (not `$host`, which drops a non-default port). Remote functions would need it too; they stay
  off.
- **Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
  from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
  browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
  closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow
  a rebind, and those are gated by a console token or rate-limited.
- **Tests:** the cross-origin check is one pure module, unit-tested against a matrix of headers and
  copied to each app as D20 shares the opening modules. One Playwright test against the built server
  (`bun ./build`) checks that a cross-site form POST is refused and that a same-origin POST carrying
  no `Sec-Fetch-*` headers passes, both on `localhost` and on a plain-HTTP host name that isn't
  loopback (such as Chromium's `--host-resolver-rules="MAP app.test 127.0.0.1"`).
- **Cookies:** session cookies are named after the app (comradarr: `comradarr_session` for the
  owner session), because cookies ignore ports and apps on one address would otherwise sign each
  other out. They are host-only, `HttpOnly` and `SameSite=Lax`. Every cookie is `Secure` exactly
  when the browser's address is `https`, so a plain-HTTP install at home still works. Every cookie
  write and deletion sets `secure` explicitly (SvelteKit's default is `Secure` on every host but
  `localhost`), and a deletion whose scheme isn't known uses `secure: false`, which works over HTTP
  and HTTPS.
- **A wrong address never locks the owner out.** No stored address can stop password sign-in: a
  wrong `ORIGIN` is fixed or removed, then the app restarts. The OIDC callback address is stored,
  so OIDC may need registering again after a move, but password sign-in always remains (D20).
- **Signed-in pages** (comradarr) send someone who isn't signed in to owner sign-in, with a "session
  expired" notice when their session ended, and JSON callers get a 401. A 403 means the caller is
  known but not allowed, such as an API key without the action or a refused cross-origin request, so
  the two never mix.
- **Password sign-in** (comradarr). The password hash is Argon2id, memory-hard and slow, with its
  parameters fixed in the code (never a setting) and stored in each hash; a successful sign-in
  re-hashes an outdated hash. An unknown username is checked against a fixed placeholder hash, so it
  takes as long as a wrong password, and every failure gets the same "invalid credentials". Every
  attempt is audited with its method and outcome (success, unknown user or wrong password). A
  successful sign-in always issues a new session token. Every comparison of a secret is
  constant-time. The legacy app refused passwords below a minimum length and from a list of common
  ones; the password rules below settle both.
- **Password change** (comradarr) needs the current password, and in one transaction stores the new
  hash, replaces the current session and ends every other one.
- **Sessions** (comradarr). A session token has at least 256 bits of randomness, and only a fast
  hash of it is stored and looked up. A session ends at its idle or its absolute lifetime, whichever
  comes first (the legacy app's defaults were 7 and 30 days, changeable; the lengths are the open
  decision below). Each request updates its last-seen time in the background, best effort, never
  failing the request. The owner may have any number of sessions. The sessions list shows each one's
  start, last use, address, user agent and sign-in method, marks this browser's, and offers revoking
  one and "revoke all other sessions"; the address and user agent are only shown, never used to
  decide access. A session revoked elsewhere disappears live (`events`). Sign-out and revoking
  delete the session, with nothing kept that could be replayed, and each is audited. Any failure to
  check a session, other than a clear "not signed in", counts as not signed in. The session cookie
  has no expiry in the browser: the stored session decides how long it lasts.
- **Rate limits** apply per client address (comradarr: as `http-boundary` resolves it). A refusal is
  a 429 with `Retry-After`, as a form error, a JSON error or a branded page, whichever the caller
  expects. (comradarr) Tight on signing in and loose elsewhere, because throttling the owner's own
  pages helps nobody:
  - signing in: 10 attempts a minute and 50 an hour per address, and per username a delay before
    each further attempt after repeated failures, doubling from 1 second to 2, 4, 8 and 16 and
    capped at 60, keyed by the submitted username in lower case whether or not it exists, cleared by
    a success and never expiring by itself. No hard lockout: it would let anyone keep the owner out;
  - per address, small fixed limits: the claim (10 an hour, no lockout), recovery, two-factor's
    failed attempts (`two-factor` sets their numbers), failed API-key checks (per address, never per
    key, which rotating guesses would defeat), the OpenAPI document (about 10 an hour), CSP reports
    and the health check;
  - password change per owner, and requests with a valid API key per key (several hundred a minute,
    changeable), so a leaked key is contained;
  - signed-in pages and the OIDC callback aren't limited.

  Counters live in memory and in PostgreSQL, so a restart doesn't reset an attacker's limits.
- **Errors** (comradarr). A validation error sits on its field; an expired session goes to sign-in
  with a "session expired" notice; a connector error names the connector and offers retry or
  reconfigure, as the error says; any other unexpected error shows a generic message with the
  request id to look up in the logs. A page that fails to load shows an error page; an action that
  fails shows inline, and the page stays usable. An empty state says what comes next, such as adding
  the first connector, or that the first sync is running.
- **The app shell** (comradarr): PRODUCT.md's sidebar, with the rotation heartbeat beside the
  wordmark (`rotation`). Pages render on the server first, and forms work without scripts, enhanced
  with pending states and optimistic updates followed by a refresh. Filters, sorting, search and
  paging stay in the URL, so a view can be bookmarked and shared.

#### http-boundary

- **Proxy trust** decides whether forwarded headers say who the client is. Until it is saved,
  nothing is trusted and the client address is the connection's. Trust is decided by the
  connection's address alone, never by a header or anything the form sends. When the connection
  comes from a trusted proxy, the client address is the rightmost address in the forwarded chain
  that isn't itself a trusted proxy, so chained proxies work; an empty or malformed chain falls back
  to the connection's address with a warning, and a chain with anything but addresses is refused
  whole. Resolved once per request, the client address is what every stage reads: rate limits, the
  audit trail, the logs and the address check.
- **Proposing and testing.** The Verify access step records what it saw on its own request: the
  connection's address, the `Host` header, the forwarded chain, forwarded protocol and host, and a
  `Forwarded` header. A request from an internal address with forwarded headers means a reverse
  proxy, so the step proposes trusting that address, explained in plain words (otherwise every
  request seems to come from the proxy, in the audit trail and the rate limits). The owner confirms,
  widens it to a range (for container networks) or declines. A second request then shows the client
  address as it would now be resolved, for the owner to confirm, and the audit entry records it.
- **Saving.** A change is saved only after its test passes from the owner's own browser; a failed
  test keeps the previous value, so a bad paste can't lock the owner out. Saving proxy trust asks
  the owner to type the exact address or range being trusted. The step passes once proxy trust is
  saved or declined; the same test runs again after setup, and every change is audited with its old
  and new values.
- **No host list and no CORS.** The app keeps no list of allowed hosts and sends no CORS headers:
  the cross-origin check (`sign-in`) refuses cross-origin writes, no other site's page can read the
  app's responses, and the API keys' callers aren't browsers. The address check reports a `Host` it
  doesn't expect.
- **The address check** only diagnoses: it runs by itself, never blocks and saves nothing. It
  compares the address the browser uses, the `Host` header the app receives, `ORIGIN` when it is
  set, and the address a trusted proxy forwards (proxy trust). It classifies the forwarded headers
  (usable, missing, partial, invalid) and the source address (loopback, private LAN, container
  range, overlay network, public, unknown). It replaces the legacy app's saved public origin and
  allowed origins, while `sign-in` replaces its absolute URLs built from that origin (the browser's
  address, copyable links built in the browser, and relative redirects).
- **Outcomes:** already matches (success); the proxy rewrites `Host`, so add `proxy_set_header Host
  $http_host` to it (not `$host`, which drops a non-default port) or set `ORIGIN=<the shown
  address>` and restart (warning); `ORIGIN` names another address, so open the app there, or fix or
  remove `ORIGIN` and restart (warning); or the check couldn't finish (danger), saying that this
  doesn't prove a misconfiguration, with a way to run it again.
- **Without a session:** it provides the address hint on the claim and owner sign-in pages
  (`sign-in`).
- **Details** show the evidence, note that `ORIGIN` needs no forwarding headers, and give copyable
  header recipes for the common reverse proxies.
- **Forwarded headers:** a forwarded protocol must be `http` or `https`, and a forwarded host with
  whitespace, control characters or URL-structural characters is rejected. Even from a trusted
  proxy, forwarded headers never set the browser's address or change the strict-transport decision.

#### events

- Publishing never blocks and never throws. Events include a sync finishing or failing; rotation
  dispatching, tracking or idling; a tier changing; indexer and connector health; a priority search
  finishing; and sign-in and session events. Internal subscribers may take one type; the live stream
  and `notifications` take them all.
- No event carries a secret or anything derived from one, because events reach the browser.
- The stream is server-sent events, since the browser never pushes live data up, proxies need
  nothing special and browsers reconnect by themselves. It needs the owner's session cookie; API
  keys don't reach it. Each client has a bounded queue, and a slow client's events are dropped
  silently: the stream only says what changed, and the page fetches the current state through its
  normal data. A comment every 15 seconds or so keeps proxies from closing an idle stream.

#### sonarr-provider

The first provider builds these for every provider; `radarr-provider` and `prowlarr-provider` reuse
them. The facts about Sonarr itself are in [docs/research/sonarr.md](research/sonarr.md).
- **Keys and logs.** The API key goes only in its header, never in a query string. Logged URLs lose
  their query strings and sensitive headers are redacted. An error from an outbound call loses the
  raw request and response before it travels on.
- **Time limits.** Connecting, reading, writing and waiting for a pooled connection always have
  bounded timeouts (seconds to tens of seconds), a whole request, its body included, has a ceiling
  of about a minute, and a body that stops arriving times out between chunks.
- **Retries.** Transient failures (server errors, timeouts, connection, DNS and TLS handshake
  failures) are retried with growing delays up to a bound, honouring the upstream's `Retry-After`.
  Client errors, authentication failures and responses that fail validation are permanent and fail
  at once. The error says which, so the page can offer "retry" or "reconfigure".
- **Responses.** A response body has a real byte cap (256 MB by default, changeable per connector)
  whatever its declared length, and is read whole before any parsing, so a partial parse can never
  trigger an action. Decompression is capped at about 100 to 1. A response that isn't JSON, such as
  a captive portal's page, is refused before its body is read. Parsing limits nesting depth,
  container size and the total number of values.
- **Redirects are never followed:** a 3xx is an error for the owner ("redirect refused; check your
  proxy"), because a clone could send the authenticated request elsewhere.
- **Validation.** Every string and list from upstream has a maximum size, numbers have plausible
  ranges and nothing is coerced (a number field takes only numbers). Library responses (series,
  episodes, movies) accept unknown fields, so upstream additions don't break comradarr; control
  responses (system status, command status, indexer settings) refuse them. A validation error names
  the field and the rule, never the value.
- **Hostile responses.** Each connector counts hostile responses in a row: oversized, malformed, of
  the wrong type or failing validation. Five make it degraded and twenty unhealthy (`connectors`);
  every success counts one down, and zero is healthy again. A server error counts as transport, not
  hostile. The thresholds are fixed, and every change of health is an event.
- **Upstream text** is always escaped when shown and never used to build selectors, patterns or
  code.

#### connectors

- **A connector** is one Sonarr or Radarr (and later Prowlarr) instance: a unique name the owner
  chooses, its type, its URL, its API key, its pacing (`budgets`), its TLS overrides, an optional
  response-size cap and a paused flag. The key is encrypted and bound to the connector's own
  generated id, which never changes, never to its name or URL. Deleting a connector deletes its
  mirror rows, schedule rows, commands, priority searches and sync state.
- **Adding and editing** run the checks cheapest first and stop at the first failure, with a message
  for it: the fields (the URL's form, the key's format, the name); the URL's address (below); one
  authenticated call to the instance's system status; the response's shape (a failure means "this is
  not a Sonarr", Radarr or Prowlarr); and the version, which only warns (D23). Only then is the
  connector saved, its key encrypted, and audited. Editing the URL or the key runs every check
  again, so a connector is never pointed at an address nobody checked. The stored key is used, for a
  test or a save, only while the URL is unchanged: a changed URL needs the key typed again.
- **The stored key** enters only through adding or editing, whose request bodies are never logged.
  It is opened only by the cipher and when the request header is set, it shows only as a receipt
  with its last four characters, and a forgotten key is replaced, never shown.
- **Health** is worked out in memory: healthy, degraded (fewer dispatches), unhealthy (no
  dispatches, while health checks go on) and unreachable (transport failures). It recovers by itself
  as calls succeed (`sonarr-provider`).
- **Pausing** a connector stops its dispatches and keeps everything; pausing and resuming are
  audited.
- **The detail** shows the sync status, the last error, recent commands, the inherited indexer
  limits and budget (read-only, `indexer-budget`) and the pacing with its hints (`budgets`), with
  editing, deleting, pausing, syncing and refreshing the indexer data. The list marks a connector
  that skips TLS verification with a warning badge.
- **URLs and addresses** (the outbound HTTP the first provider builds, D9). A URL is `https://` or
  `http://` with a host, and is refused with credentials or a fragment, a sign of a pasted browser
  address. `http://` is allowed only for a local address (loopback, private LAN, link-local, IPv6
  unique-local and `100.64.0.0/10`, the range Tailscale and other VPNs use) and only once the owner
  ticks the opt-in for that URL; `https://` is allowed for any address the policy allows (owner
  rule, 2026-11-04). The host is resolved and every address it resolves to is classified,
  IPv4-mapped forms unmapped, international names normalised and a trailing dot dropped. Always
  refused: multicast, unspecified, broadcast, documentation and benchmarking ranges. The policy has
  three modes the owner chooses: default allows loopback, private ranges (home networks and
  container bridges), unique-local IPv6, carrier-grade NAT and public addresses, and refuses
  link-local, where cloud metadata services live; strict allows only public addresses, for instances
  in the cloud; permissive also allows link-local, warns when chosen and at every start. A host
  whose addresses fall on both sides is refused. Before every call the host is resolved and
  classified again, the connection goes to a classified address and the connected peer is checked,
  which defeats DNS rebinding; a failure is its own error ("resolved to a disallowed address").
  Whether an address is local, for `http://`, is judged by these resolved addresses, never by the
  name. The same rules cover notification destinations.
- **TLS** verification is always on and can't be turned off for all connectors; a connector may skip
  verification, shown with a warning badge, or use its own CA bundle.

#### sync

- **The mirror** is a cache of what the instances know, never the source of truth. Each row is keyed
  by its connector and upstream id, so two instances can hold the same id and one hostile instance
  can't touch another's rows. A series keeps its title, catalogue id, status (continuing, ended,
  upcoming or deleted), monitored flag, quality profile, path and its season, episode and file
  counts and size on disk; an episode its series, season and episode numbers, title, whether it has
  a file, monitored flag, air date, file id, size and quality; a movie its title, catalogue id,
  status, monitored flag, whether it has a file, quality profile, path, size and year. Counts are
  worked out from the item lists, never taken from the upstream's totals. Nothing else is kept: no
  overview text, artwork, genres or ratings.
- **The schedule** has one row per searchable episode or movie, keyed by connector, type and
  upstream id, with its series and season copied in so planning needs no joins, its last-searched
  time (empty for never, which sorts first), its search count, its tier and its paused flag.
- **Tiers** (lower rotates faster): 0 Missing, no file, even in an ended series; 1 Recent, a file
  and aired or released within 90 days (episodes) or 180 days (movies); 2 Monitored, a file and a
  continuing series or a recent movie; 3 Completed, a file and an ended series or an old movie,
  still rotating. Only sync sets a tier, from files, dates and series status, never from a search's
  outcome; rotation only reads it. Sync may change a row's tier and grouping, but never its
  last-searched time, search count or paused flag. A newly added row has never been searched, so it
  comes first in its tier. Items gone upstream leave the schedule in the same transaction as their
  mirror rows.
- **Three modes:** incremental, every 5 minutes: one call for the series or movie list, a
  fingerprint compared with the stored one, and episodes fetched only for the series and seasons
  whose statistics changed; deep, every hour: every episode or movie fetched and compared field by
  field, and every tier worked out again, which catches tiers that change with time; full, every 12
  hours and on a connector's first sync: everything fetched, rows gone upstream deleted and the
  schedule fully reconciled, the only mode that finds removals. The intervals are settings. A Radarr
  connector skips incremental and always runs deep, since a deep Radarr sync costs the same.
- **Fingerprints** are worked out from the list response alone: per Sonarr series and season its
  monitored flag, episode count, file count, total episode count and size on disk; per Radarr movie
  its monitored flag, whether it has a file, its size and quality profile. Stored per connector and
  compared as structures, they give the series added, removed and changed, and which seasons. They
  only save calls: changes that cancel out escape them, and deep and full syncs catch those.
- **Applying.** Additions, removals and changed fields are written in bulk, and the schedule changes
  in the same transaction, so the mirror and the schedule never disagree. A change in whether an
  item has a file can change its tier, such as Missing to Monitored. Episodes with files in an ended
  series become Completed; missing ones stay Missing.
- **Checks before storing** that the API's types can't make: a date outside 1900–2100 becomes empty
  and is logged, cut short; ids must be positive and season and episode numbers sane.
- **The coordinator** ticks every 30 seconds and runs, per active connector, the most important mode
  that is due: full when due or never run, otherwise deep, otherwise incremental. One sync at a time
  per connector, several connectors at once, and a Sonarr sync fetches about five series' episodes
  at a time. A failure is recorded on the connector's sync state and retried on the next tick; it
  never blocks later syncs. Each sync's end or failure is an event with its counts, and each tick
  logs one line. When first run completes, connectors never synced get a full sync at once.
- **Sync state** per connector: the last full, deep and incremental sync, the stored fingerprint,
  its status (idle, running or failed), the last error, the items synced and how long it took.
- **Syncing by hand** (full, deep or incremental) is audited.
- **Targets** (legacy app's design, never measured): a deep or full sync of a 500-series library in
  about a minute, an incremental one in under a second.

#### budgets

- **One interface** with two sources, the default here and the inherited one (`indexer-budget`): how
  many commands may go to this connector now, a report of a dispatch, and the health of its
  indexers. Rotation doesn't know which source is in use. The source is chosen at startup and again
  when connectors change.
- **The default budget** per connector: a daily cap (100 by default), at most 2 commands in flight
  and at least 30 seconds between commands. The cap is spread through the day (at 100, about one
  command every 14 minutes), never spent in a burst. Each is editable per connector with a hint;
  most owners never change them.
- **The compound limit:** what may go now is the smallest of what remains today, what the interval
  allows and the room under the concurrency limit. Concurrency matters most: each concurrent search
  queries every indexer.
- **Read-only display:** the budget in use, with the reason for its current limit in plain words.

#### rotation

- **The loop** ticks every 15 to 30 seconds (a setting). For each active, healthy connector it asks
  the budget how many commands may go, takes pending priority searches first (`content`), then that
  many of the stalest unpaused items in tier and last-searched order, plans them, dispatches the
  commands, records them and updates the schedule. It does nothing before first run is complete and
  idles when the budget is spent, the connector is unhealthy or paused, or there's nothing to do. It
  logs one summary per tick, and dispatching, tracking and idling are events. Rotation starts on a
  connector only once its schedule is filled.
- **Order.** The next items come from one indexed query in (tier, last searched) order over unpaused
  rows, never-searched first, whose cost doesn't grow with the library (the legacy app aimed at
  under a millisecond at 500,000 rows).
- **The only state per item** is its last-searched time and its search count: no queue, no retry
  state and nothing to get stuck, so a restart resumes from the times.
- **Sonarr's planner** groups the due items by series, then season: a series search when they span
  more than half the series' seasons, or at least three; a season search when two or more fall in
  one season, or more than 30% of a season's episodes are due; an episode search, batched, for the
  rest. These thresholds are constants, not settings. A season or series search covers every episode
  in that season or series, due or not.
- **Radarr's planner** puts movies into one multi-movie search, up to a batch size that is a
  setting.
- **Every planner** covers every item it gets, never mixes connectors, never makes more commands
  than items and never drops an item; its plan is the same each time up to order. Property tests
  check this. Each connector type has its own planner behind one interface.
- **A command** records its connector, type, payload, the command id the instance returned, when it
  was dispatched and resolved, its status (pending, dispatched, completed, failed or timed out) and
  every schedule item it covers.
- **Dispatch** moves every covered item to the back at once, when the command is sent, not when it
  finishes, so an item in flight is never sent again.
- **Tracking** polls command status every 30 seconds and resolves finished commands. A completed
  command may trigger a sync of the items it covered, to see a new file and change tiers. A failed
  or timed-out command is just resolved: there is no retry, and its items come round again when they
  are stalest. Commands in flight at a crash are polled again after the restart.
- **Pausing** the rotation, and pausing an item (`content`), are audited; routine ticks aren't.
- **The heartbeat** beside the wordmark beats only while rotation is dispatching; it is still when
  rotation is idle or paused, before first run is complete and without connectors.

#### indexer-budget

- **Reading Prowlarr:** each indexer's query limits, its usage so far from every source, which
  indexers are disabled, and which serve each connector, by matching Prowlarr's applications to the
  connectors' URLs and following its tags. The facts are in
  [docs/research/prowlarr.md](research/prowlarr.md). The reads are cached for about five minutes and
  refreshed on a health event or when the owner asks.
- **The inherited budget** per connector is the smallest, over the indexers serving it, of the
  indexer's limit minus the safety reserve minus its usage so far. Hourly and daily limits become a
  rate per interval, keeping the burst limits of hourly-limited indexers. Disabled indexers are left
  out. While Prowlarr can't be read, the default budget applies.
- **On the connector's detail,** read-only: the indexers found through Prowlarr, their limits and
  usage, and the budget with the reason for its current limit.
- **The health monitor** polls Prowlarr and raises events for an indexer disabled (how long, and its
  failures), a failure rate over 30% (trouble before a disable; rotation may slow down) and an
  indexer over 80% of its limit (information, shown on the dashboard). A connector whose indexers
  are all disabled is skipped without an error and resumes by itself.

#### content

- **The browser** holds up to 500,000 rows: filters by connector, type, tier, whether an item has a
  file and whether it is paused; sorting; a search that waits about 300 ms after typing; and per row
  the tier, last searched, search count and file status. Pages are keyset pages (constant cost at
  any depth) and rows are virtualised; filters, sorting, search and the page stay in the URL. A
  browser this size has never been built, so it is prototyped early in the module.
- **An item's detail** shows its mirror fields, its schedule state and the recent commands that
  covered it, with "Search now" and pausing.
- **Search now** is a priority search: one per item (connector, type and upstream id), so a double
  click can't make two. Rotation dispatches it before any other item on its next tick, limited only
  by the concurrency limit, not the daily cap, and afterwards the item's last-searched time updates
  as usual, so it rejoins the rotation. Its completion is an event.
- **Pausing an item** takes it out of the rotation without deleting it. Searching and pausing are
  audited.

#### notifications

- **A consumer, never a source:** `notifications` takes events from `events` and sends them out, so
  security and health events reach the owner when no tab is open.
- **Channels:** a multi-service relay, one destination URL that embeds the destination's token
  (several destinations mean several channels); a webhook, with its URL, POST or PUT, optional
  headers (for a bearer token) and a body template rendered from the event; and email, a guided form
  (host, port, credentials and implicit TLS or STARTTLS, never plain text) that builds a relay mail
  URL and is sent like any relay channel. A channel has a name, its kind, an enabled flag, its
  encrypted settings (`secrets`), its TLS overrides, and when it was last tested with the result
  (never, ok or failed).
- **Hardening:** destinations follow `connectors`' address rules, `http://` and its opt-in included,
  are resolved and classified again at every send, and take the same TLS overrides; webhooks never
  follow redirects. A send refused by the address rules is permanent, never retried, and logged.
- **Tested before saved:** saving a channel sends a real test message, and only a success saves it
  and records the test. A failure gives the specific error (a TLS handshake, a 404, a URL that
  doesn't parse, an unreachable host) and keeps the previous settings, so a channel is never saved
  broken. Stored secrets (a token in the URL, a webhook header) are reused, for a test or a save,
  only while the destination is unchanged: a changed destination needs them typed again.
- **Routing:** one enabled pair of event type and channel is one notification; several pairs fan
  out; no pair means off, with no separate mute. The matrix groups event types (security,
  operational health, started by the owner) against the channels, with one toggle per cell. Deleting
  a channel deletes its routes.
- **The default profile** is applied once, when the first channel is created; later channels start
  with everything off, so an event the owner silenced isn't switched back on. On: security (a new
  session; a password change; an API key created or revoked; five or more failed sign-ins within
  five minutes; OIDC failures; a failure to write the audit trail; recovery used), operational
  health (a connector's reachability changing; an indexer disabled or re-enabled, coalesced; a sync
  failing three or more times in a row; 80% of a daily cap used) and a priority search finishing.
  Off but available: tier changes, each sync's or rotation cycle's completion, and connectors added,
  edited or deleted.
- **Templates** use a tiny language: variables and one conditional block, which doesn't nest, for
  optional fields; no loops, expressions, attribute access or computed values, so a template has
  nothing to run and translators' placeholder checks understand it. The built-in templates are
  messages, translated (D21); the owner's override for an event type and channel kind is stored as
  written. A send uses the override, else the built-in in the owner's language, else English, never
  a mix. The editor starts from the English default, lists the variables the event has, and warns
  when a placeholder is dropped.
- **Delivery** is fire-and-forget: sends run concurrently with their own timeouts and the bus never
  waits. Each notification gets a first attempt (10 seconds) and three retries after 1, 5 and 30
  seconds (15, 20 and 30 seconds each), and is then abandoned with a warning that names the event
  type and the channel, never its settings. There is no delivery table and no dead-letter queue: the
  log is the record, because durable delivery isn't a goal for one owner.
- **Coalescing:** operational-health events within a rolling 60 seconds go out as one summary;
  security events and the owner's own never wait. The window is a constant.
- **The kill switch** is one global setting, on by default. Turned off, it stops every delivery and
  keeps the channels and routes; every notifications page shows a banner while delivery is off, and
  suppressed sends are still logged.
- **Audited:** creating, editing and deleting channels, routes and template overrides; single
  deliveries are logged only.

#### audit-log

- **The page** lists entries newest first, with filters by action, actor, date range and free text,
  a detail drawer with the redacted context, and an export that streams the entries as plain text.
- **Retention** keeps everything by default; an optional cap is applied by a scheduled sweep that
  connects as the audit-admin role (D17), deletes in batches and is itself audited.

#### preferences

- **The theme** is light, dark or system, stored for the owner. With a stored choice the first
  server-rendered page already has it; with "system", and before sign-in, a small preference cookie
  written before the first paint does, so the page never flashes the wrong theme. Switching is
  instant.

#### api-keys

- **A key** is a recognisable prefix, so secret scanners can spot a leaked one, then a random part
  of 256 bits. Only a fast hash of the random part is stored, with the prefix and the last four
  characters for display; a value without the prefix is ignored without a database lookup. A key
  comes in its own header or as a bearer token.
- **Creating** a key takes a name, an optional expiry and an optional narrower scope. The key is
  shown exactly once, with a copy action and a warning that it won't be shown again, and never goes
  into page data that survives navigation, storage, a URL, the logs or the audit trail.
- **Using:** an expired key is refused when it is checked, and a key outside its scope gets a 403
  naming the action. The last use is recorded, best effort, on every use, and the first use is
  audited once, so the owner sees when an integration came online.
- **Revoking** is immediate (the key and its scope are deleted), and audited with its prefix and
  last four characters.
- **The OpenAPI document** and any viewer for it need sign-in (otherwise a 401 with no body), are
  rate-limited (`sign-in`), and use no assets from a CDN. Everything that exists is described: there
  are no hidden endpoints, and development-only ones are switched by flags.

#### metrics

- **The metrics endpoint** is off by default, and while off it isn't registered and answers "not
  found". When on, it serves the common text format to the addresses on its allowlist, kept inside
  the app: empty denies everyone, loopback isn't allowed by itself, an address not on it gets a 403
  with an empty body, and one on it needs no sign-in. It covers requests and their latency, sync
  durations, dispatches, tracking latency, budget use, active sessions, pool saturation and the
  process.
- **Trace export** to the owner's collector is opt-in too. Both use connector names as labels, never
  identity, addresses or user agents.

#### oidc-sign-in

- **Discovery and the signing keys** are fetched at startup and refreshed every 24 hours, and on a
  signature failure (at most once a minute, with one retry); if a refresh fails, the last key set is
  used.
- **The flow** is the authorization code flow with PKCE, S256 only, never plain. Its state is a
  signed, single-use value bound to the browser's sign-in attempt, the ID token's nonce must match,
  and both expire after 10 minutes.
- **The ID token:** its algorithm is read from the header before any key lookup, `none` and
  symmetric algorithms are refused and only listed asymmetric ones accepted; issuer, audience,
  expiry and issued-at (and not-before when present) are checked with 60 seconds of clock skew, and
  the nonce must match.
- **Sign-out** ends the local session and, when the provider advertises an end-session endpoint,
  goes there to end the provider's session too.
- **The provider's settings** are set in the app (row 23), the client secret encrypted (`secrets`),
  and the issuer follows `connectors`' address rules, `http://` and its opt-in included. A failed
  OIDC sign-in shows the owner a generic failure and logs the specific reason.

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
- SvelteKit 3 exposes only the environment variables declared in `src/env.ts`.
- Tools run under Bun with `--bun`; a lifecycle script (`prepare`) calls each bin as
  `bun --bun <bin>`, because `bun ci` doesn't apply `--bun` to lifecycle scripts.
- Bun blocks `@parcel/watcher`'s install script (it builds with Node); Panda works without it.

## Commands

| Command | Does |
|---|---|
| `bun ci` | frozen install; `prepare` runs `svelte-kit sync` and Panda codegen |
| `bun run --bun dev` | Vite dev server; needs a key in `.env` or the environment, and without one every request fails with the key error |
| `bun run --bun build` | production build through adapter-bun into `build/`; needs no key and never embeds one |
| `bun run --bun preview` | runs the built server (`bun ./build`; `PORT`, default 3000, and `HOST`); without a valid key it exits before listening |
| `bun run --bun check` | `svelte-kit sync`, Panda codegen, then `svelte-check` failing on any error or warning |
| `bun run --bun test` | Vitest unit tests, once (no watch) |
| `bun run --bun smoke` | Playwright e2e: the browser smoke test and the startup tests, with a key it generates, never a developer's `.env` or exported key; it starts the built server, so `build` comes first, and Chromium comes from `bunx --bun playwright install chromium` |
| `bun run --bun lint` | `biome ci`, read-only; `biome.json` lists the file extensions Biome checks |
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

- **Unit (Vitest, `node` environment):** the `/healthz` handler (status 200, body `ok`,
  `cache-control: no-store`) and the `secrets` module (`config/secret-key.test.ts`, and
  `key-text.test.ts`, `keyring.test.ts`, `cipher.test.ts` and `secret.test.ts` in
  `security/secrets/`, under `src/lib/server/`). Component tests use happy-dom when components
  exist; never jsdom.
- **e2e (Playwright, Chromium, under Bun):** against the built adapter-bun server, with a master key
  Playwright generates for each run, so CI needs no stored secret.
  - `smoke.test.ts` checks that `/` returns 200, shows the placeholder heading, hydrates (it waits
    for the `data-hydrated` attribute the root layout sets when mounted), applies the Panda
    background token and `h1` text style and logs no console errors, and that `/healthz` returns
    `ok`.
  - `secret-key.test.ts` checks that the built server refuses to start without a valid key.
- prek runs the unit tests (`tests` hook); CI's `smoke` job builds with no key and runs `smoke`.
- **Each module's tests** keep the legacy app's quality bar. Behaviour is tested against recorded
  responses from real Sonarr, Radarr and Prowlarr instances, not hand-written mocks, with a check
  against live instances from time to time to catch drift (which needs live instances to hand).
  Property tests cover the planner, the sync diff, keyset paging, the URL classifier and the tier
  rules. Integration tests run against a real PostgreSQL, the role privileges included (D16). Every
  error type is provoked by at least one test, component tests run automated accessibility checks,
  and coverage is watched, never a gate.

## CI and repo tooling

comradarr is a Bun web repo with edbfi-ci's Bun web templates:
- `.pre-commit-config.yaml`: Biome, `biome-migrate`, `check-peers`, the `tests` hook, plus a
  `check` hook (`bun run --bun check`), keeping the vendored-skill exclusions and the `docs-set`
  hook.
- `.github/workflows/ci.yml`: `checks` (prek), `smoke` (Chromium install, build, smoke) and `audit`
  (outside PRs); `checks` and `smoke` sit behind `ci-ok`, every job that installs runs with failing
  `node`, `npm` and `npx` on `PATH`, and the weekly run is `4 5 * * 0`.
- `.github/dependabot.yml` covers `github-actions`, `pre-commit` and `bun`, and
  `.github/workflows/biome-migrate.yml` applies Biome migrations and formatter output to
  Dependabot's Biome PRs.

## Boundaries

- **Always:** Bun with `--bun` for every tool; tokens only through Panda; keep SvelteKit's
  configuration in the Vite plugin; prek green before each commit.
- **Ask first:** any dependency not in the tech stack table; any change to `biome.json` (it is
  shared by the five rewrite apps); any CI shape that differs from the edbfi-ci template.
- **Never:** a database, authentication, Sonarr, Radarr, Prowlarr or any product feature before its
  module's approved spec builds it; a second styling tool or primitive library; Node, npm or npx
  anywhere, including CI.

## Success criteria

1. A fresh clone passes `bun ci`, `bun run --bun check` (zero errors and warnings), `bun run --bun
   test`, `bun run --bun build`, `bun run --bun smoke` and `prek run --all-files --hook-stage
   manual`, with no Node on `PATH`.
2. The built server (`bun ./build`) serves `/` with the placeholder page and `/healthz` with `ok`
   when started with a valid key.
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
3. **Security headers and CSP.** `setup`'s Module notes make security headers and a strict
   nonce-based CSP always on, with a report endpoint. They belong to the first module that serves
   real pages (`setup`, whose claim page comes before `sign-in`), not the skeleton.
4. **Where the icon lives.** SvelteKit serves static files from `static/`, so the icon is
   `static/comradarr-icon.svg` (it was in `public/`), which the README shows and `src/app.html` uses
   as the favicon.
5. **Health.** `/healthz` always answers `ok`. The module that adds the database replaces it with
   the health check in `setup`'s Module notes.
