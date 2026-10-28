# Decisions

Each entry is a decision and why it was made. Open entries keep their number when they're settled.
The stack entries come from the shared rewrite recipe used by all five edbfi apps, cut down to what
applies to comradarr. Versions live in `package.json` and `bun.lock`.

## Decided

### D1. SvelteKit on one origin

Svelte 5 and SvelteKit 3, with TypeScript for browser and server code. SvelteKit serves pages, form
actions, API endpoints and assets on one origin, with server rendering on and interactive components
in the browser. Backend work happens in server routes, server `load` functions and form actions,
which call application services.

Why: one framework and one origin for the operator UI, its JSON endpoints and the live-update stream
keeps sessions, origin checks and deployment simple, and it's the recipe all five apps share.

### D2. TypeScript 6, strict

The latest stable TypeScript 6.x at bootstrap, locked; no prereleases, and major upgrades wait until
the Svelte tooling supports them. Strict type checking, run explicitly (the `check` script): running
TypeScript under Bun doesn't type-check it. External input is validated at runtime.

Why: [SvelteKit 3 requires TypeScript 6](https://svelte.dev/docs/kit/migrating-to-sveltekit-3#Updated-dependencies).

### D3. Bun everywhere, no Node

Bun is the runtime and package manager in development, CI and production. Tools run with `--bun`
(`bun run --bun`, `bunx --bun`) so their Node shebangs don't apply; no `node`, `npm` or `npx`.
Packages still come from the npm registry. `bun.lock` is committed and CI installs with
`bun install --frozen-lockfile`.

Why: one runtime for every step, and the official Bun adapter needs it.

### D4. One application container, one process, one port

[`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun) builds a Bun server. comradarr
runs as one application process with one HTTP port in one container. The database is a separate
service (D5), not part of the application container. Secrets are configured separately from the
database and used only in server-only code.

Why: a single self-hosted instance for one operator doesn't need more, and in-process state (the
first-run claim token, the event bus behind live updates, the job loops) can assume one process
(see D19).

### D5. PostgreSQL through Drizzle and Bun SQL

The database is PostgreSQL, deployed as a separate service with its own persistent storage: either
a PostgreSQL service shipped alongside the app or an existing instance. The app reaches it through
Drizzle's `drizzle-orm/bun-sql` adapter on Bun's built-in `SQL` client, with pool limits configured
for the deployment. Drizzle Kit generates SQL migrations, which are reviewed and committed.
Migrations run before the app accepts requests or starts jobs, with one migration owner per
database.

Why: comradarr's append-only audit log and privilege separation rely on database roles and
privileges (D7), which PostgreSQL provides.

### D6. Transactions and data access

Database access sits behind named operations (save a connector, claim a due job). Application
services own the business rules and the transaction boundaries. Every statement in a transaction
goes through the callback's transaction object; transactions stay short, and network calls happen
outside them. No generic layer that promises interchangeable SQL dialects.

Why: a statement outside the transaction handle runs on another pooled connection and escapes the
transaction. comradarr targets one engine, so a dialect abstraction would be cost without benefit.

### D7. Scoped database roles

Migrations and runtime access use separately scoped database roles, so the database itself enforces
the audit rules: the role the app runs under may insert and read audit entries but never change or
delete them. The role design is behaviour from the
[legacy spec](product/legacy-spec.md) (§11.5); its implementation and tests are open (D16).

Why: a bug or injection in the request path must not be able to alter or erase audit history, and
only the database can guarantee that.

### D8. In-process background jobs

Jobs (sync, rotation, health checks, notifications, housekeeping) belong to application startup and
shutdown, never to page requests. Job state is persisted so work recovers after a restart, runs
never overlap, and retries are safe.

Why: SvelteKit and Drizzle provide none of this lifecycle, and the rotation and sync loops must
resume from stored state after a crash without losing work.

### D9. SSRF-safe outbound HTTP

Every outbound call goes through server-side `fetch` with explicit address validation and a redirect
policy.

Why: the Sonarr, Radarr, Prowlarr, identity-provider and notification addresses are admin-supplied,
so the server must not become a proxy to arbitrary hosts.

### D10. Generated HTTP API clients

Typed HTTP API clients come from `@hey-api/openapi-ts`, generated from the app's own OpenAPI
document during the build. Generated files are never edited by hand. Page loads and form actions use
SvelteKit's generated types instead; services call database operations directly.

Why: one typed contract for the JSON endpoints, without hand-written client code drifting from it.

### D11. Panda CSS and Ark UI only

Styling is Panda CSS 2 through its Vite plugin, with build-time transforms on. Accessible primitives
come from Ark UI for Svelte, unstyled and styled with Panda tokens. Design tokens are defined once,
in Panda's configuration, which loads only `@pandacss/preset-base` (utilities and conditions, no
preset palette) and sets `strictTokens`, so a raw value in a component fails type checking. No
second styling tool or primitive library.

Why: one token source and one primitive library keep the design system (DESIGN.md) enforceable.

### D12. Structured logs to standard output

Logs are structured, one entry per line, written to standard output. The library is open (D14).

Why: the container runtime collects stdout; structured lines can be filtered without parsing prose.

### D17. PostgreSQL in its own container; the app creates its roles

PostgreSQL runs as its own service, never inside the app image (D4). The documented Docker Compose
example runs it in a container next to comradarr, and an existing PostgreSQL server works the same
way. The `setup` spec pins the oldest PostgreSQL major version comradarr accepts.

- **Before the first start**, the operator supplies two secrets, each as an environment variable or
  a secret file: the master key (D20) and one database URL for a role that owns comradarr's
  database and may create roles. Missing either stops startup.
- **At startup**, before serving or starting jobs, the migration step runs as that owner role (D5)
  and creates or updates the two other roles of D7: the app role and the audit-admin role. Their
  passwords are derived from the master key with HKDF (WebCrypto), so there are no more credentials
  to store or hand out, and after a key rotation the migration step sets the new passwords. A
  pre-flight check names any missing privilege before anything migrates. The owner connection
  closes once migrations are done.
- **At runtime**, requests and jobs use the app role only, and the retention sweep connects as the
  audit-admin role on a short connection of its own. Each role logs in separately: switching roles
  on one connection (`SET ROLE`) would let an injected statement switch back.
- **Backup** is PostgreSQL's own: a `pg_dump` of comradarr's database and its restore, documented
  with the Compose example. The master key is backed up separately and restored with the database
  (D18). comradarr ships no backup command. The migration step recreates the two roles after a
  restore, so a dump without roles is enough.

Why: the owner chose this shape. It keeps PostgreSQL out of the app image (D4) and stays close to
the legacy "one setting to start" (legacy spec §1.2, §2.2): two secrets and a Compose example. The
owner role is used only at startup, as the legacy migration role was (legacy spec §11.5). Deriving
the role passwords from the master key replaces the legacy generated credentials and the separate
audit-admin credential (legacy spec §11.5, §15.1) with nothing to store.

### D20. Shared opening modules and owner sign-in, in the same shape in every app

Every edbfi rewrite app builds five modules before any feature module, in this order: `secrets`,
`i18n`, `setup`, `sign-in`, then `two-factor`. Each app also gets `oidc-sign-in` later. These
modules have the same shape in all five apps, so signing in works the same way everywhere. Each
app keeps its own copy; there is no shared package.

- **One owner.** Each instance has exactly one owner account, with no other roles: no co-admins,
  viewers or operators, and none planned for later.
- **`secrets`.** Secret values are encrypted in the app before they reach the database, with
  AES-256-GCM through WebCrypto, so this works on any database engine:
  - The key is 32 random bytes from an environment variable or a secret file. It is never derived
    from a password, and a missing or malformed key stops the app at startup.
  - Every encryption uses a fresh random 12-byte nonce.
  - Associated data ties each value to its record and field, so a value copied to another row or
    field fails to decrypt.
  - Every stored value carries its key ID, so a value written under another key fails with its
    own error (D24).
- **`i18n`.** The translation groundwork (D21), in place before the first screen.
- **`setup`.** If nobody has claimed the instance yet, the app prints a one-time bootstrap token to
  the console at startup, outside the structured logs (D12). Whoever types that token claims the
  instance and creates the owner account. After that, the claim no longer exists: its page answers
  "not found". `sign-in` adds signing the new owner in at the claim, as `two-factor` adds its offer,
  so the rest of first run, the steps later modules add, happens signed in.
- **`sign-in`.** The owner signs in with the username and password created in `setup`. Sessions
  are server-side, and only a hash of each session token is stored.
- **`two-factor`.** Optional, but strongly recommended: first-run setup offers it right after the
  owner account is created, before any connection step, and the admin shell keeps reminding the
  owner until it is on. It uses authenticator-app codes (TOTP), with
  the secret encrypted by `secrets`, single-use backup codes stored only as hashes, each code
  accepted once and a limit on failed attempts. When it is on, every way of signing in passes
  through it, with one optional exception for OIDC (below).
- **Recovery.** An owner who loses their password, or their authenticator and backup codes, turns on
  a recovery setting in the environment and restarts the app. It then prints a one-time recovery
  token to the console, outside the structured logs, as `setup` does. Typing the token lets the
  owner set a new password; it also turns two-factor off, so they can set it up again, and signs out
  every session. The token expires after 15 minutes (a restart prints a new one), failed attempts
  are limited per address, and once it is used the app prints no new one while the setting stays on,
  and warns at startup that the setting should be cleared. `sign-in` builds it, and `two-factor`
  adds turning itself off.
- **Plex for the owner is an option.** In the apps that use Plex (all of them except comradarr and
  zimuarr), the owner can link their account to their own Plex account in the admin settings once
  setup is done. After that, "Sign in with Plex" also signs them in as the owner. The password
  keeps working, and Plex sign-in for the owner stays off until they link. Where an app has users
  besides the owner, those users sign in with Plex.
- **`oidc-sign-in`.** The owner can also link their account to one OpenID Connect provider, such as
  Authentik, Authelia, Pocket ID or Tinyauth, which then signs them in as the owner. It uses
  discovery and the authorization code flow with PKCE, and keys the link on the provider's issuer
  and subject. As with Plex, linking never creates an owner, and the password keeps working.
  Signing in through a reverse proxy's headers isn't supported.
  - **The provider's own second factor can replace the app's, if the owner chooses.** When the ID
    token's `amr` claim (RFC 8176) reports that the owner used a second factor at the provider,
    such as Authentik's or Authelia's TOTP or a passkey, the app offers to skip its own two-factor
    for OIDC sign-ins. It stays on until the owner accepts. Every OIDC sign-in checks the claim
    again, and one that reports no second factor goes through the app's two-factor. Password and
    Plex sign-ins always do. A provider that doesn't send `amr` never gets the offer.

Each app's connection modules add their own first-run steps after `setup`. In comradarr, first run
continues with the two-factor offer, then verifying access from the operator's own browser
(`http-boundary`, legacy spec §9.4 phase 2, still mandatory), then the first connector. Until Verify
access passes, the setup gate keeps sending every signed-in page back to it, as the legacy setup
flag did (legacy spec §9.2). This replaces the legacy order, which verified access before creating
the account (owner decision). `setup` keeps the origin the instance was claimed from as the first
allowed origin, so the account request is still origin-checked. Because claiming and creating the
owner is one step, the legacy setup-claim cookie goes, and the token is printed only to the console,
without the legacy token file (legacy spec §9.1). Every claim and recovery is audited (legacy spec
§9.3, §10.8).

comradarr has no Plex and no users besides the owner, so the provider chain of legacy spec §10.1
shrinks to the password, OIDC and two-factor: no header sign-in, one OIDC provider instead of
several, no users created by a provider, and password sign-in can't be turned off (owner decision).
API keys (`api-keys`) aren't a way of signing in: the owner creates them while signed in, and they
reach only the JSON API, never pages.

Why: the owner wants the five apps to look and work alike, and everything else depends on these
modules: every app stores upstream secrets, shows text that must be translatable, needs a safe first
claim and has to know who its owner is. Encrypting in the app (D4: secrets are configured apart from
the database) keeps stolen database files unreadable without the key. Two-factor and OIDC sign-in
were the owner's call for every app, and so was letting a provider's own second factor stand in for
the app's, optionally; one standard OIDC flow covers the self-hosted identity providers without a
client for each, and `amr` is the standard way to see the provider's factor. A copy per app is
enough for five apps and avoids building a shared package before it's needed (YAGNI). comradarr's
legacy design already had most of this shape: the log-printed claim token, server-side sessions
stored as hashes, and the encrypted field with its nonce, row binding and key version (legacy spec
§9.1, §10.6, §11.2), which the shared `secrets` keeps. Its recovery mode (legacy spec §10.8) showed
that the shared opening had no way back in, and the owner asked for recovery in every app.

### D21. Every interface is translatable, in English and Danish

Every edbfi app is built for translation from its first screen. No user-facing text is written into
components or services: it comes from message files, one per language. English is the source
language and the default, and Danish is the second language. Each request uses the viewer's own
choice, then the browser's preferred languages, then English. Dates, times and numbers are formatted
for the viewer's locale through `Intl`, never in a fixed format. The message files use a format
Weblate reads, plurals included, so a Weblate project can be connected later without changing code.
Connecting Weblate is later work and belongs to no module yet. Text the owner writes, such as
comradarr's notification template overrides, is content, stored as written (legacy spec §8.2), not
translated through the message files. Built-in notification templates are translated and sent in
the owner's language.

Why: the owner wants full translation support in every app, with Weblate as the translation tool,
and English and Danish now. Adding translation afterwards touches every screen; building it in from
the first one costs little. The legacy design already passed every string through translation but
shipped English only (legacy spec §2.2, §14.7).

### D22. Paraglide JS with i18next JSON v4 messages

Translation (D21) uses Paraglide JS 2 (`@inlang/paraglide-js`) through its Vite plugin, SvelteKit's
official i18n integration. Messages live in `messages/en.json` and `messages/da.json` in i18next
JSON v4, through `@inlang/plugin-i18next` 6.2.0 or later (which fixed its plural handling), with
plurals under CLDR suffixes. Weblate reads that format as "i18next JSON v4" (`i18nextv4`),
monolingual, with `messages/en.json` as the base file.

- Components and services call the typed message functions Paraglide compiles, so a missing
  message is a type error. The compiled output is generated and gitignored.
- On the server, `paraglideMiddleware` in `hooks.server.ts` picks each request's language (the
  viewer's cookie, then the browser's preferred languages, then English) and keeps it in
  AsyncLocalStorage, so concurrent requests can't mix languages. Under SvelteKit 3 it passes the
  translated request on a copy of the event, because `event.request` is read-only.
- Dates, times and numbers stay with `Intl` (D21).

Still to validate in the `i18n` module: the pinned versions with SvelteKit 3, TypeScript 6 and Bun;
building and serving through adapter-bun (Paraglide issue
[#725](https://github.com/opral/paraglide-js/issues/725) reports the middleware returning nothing in
builds that use instrumentation); and a Weblate round trip of a plural message.

Why: it is the integration SvelteKit itself points to. Compiled, tree-shaken message functions add
almost nothing to the bundle and are checked by strict TypeScript. A language per request through
AsyncLocalStorage is safe for server rendering. i18next JSON v4 is a native Weblate format with
correct plurals for English and Danish. gettext PO (through wuchale or Lingui) would also carry
notes for translators, which i18next JSON v4 can't, but those integrations are younger and keep the
language in stores, which need care when the server renders concurrent requests; svelte-i18n
resolves messages at runtime, without typed messages. The owner left the choice to the agents.

### D23. Other software: the latest stable release only

Each edbfi app works with the latest stable release of every service it talks to, and with nothing
older. Its contract tests run against that release; when a new stable release ships, the tests and
the app move to it in the app's next release, and support for the one before goes. The app adds no
code for older versions and no workarounds for upstream bugs that a later release may fix: a bug
that harms users is reported upstream and named in the app's docs. A service on any other version
(older, newer than the one tested, a prerelease, or a version the app can't read) keeps working, and
the app tells the owner plainly which version it is tested with, in setup and on the owner's own
status screens; the public health endpoint never shows a version. Responses are still validated, so
a real difference in the API shows up as an error, not as wrong data.

In comradarr the services are Sonarr, Radarr and Prowlarr, each at its latest stable release: today
Sonarr v4 through its v3 API, Radarr through its v3 API and Prowlarr through its v1 API. The version
step of connector validation (legacy spec §7.3, step 5) warns instead of failing, the warning stays
on the connector's detail (`connectors`), and the legacy support for Sonarr v3 (§7.3, §13) goes.

Why: the owner doesn't want a backlog of backwards compatibility in any app (owner decision). Code
for old versions and for upstream bugs is seldom removed once it's in, and each workaround outlives
the upstream fix as code to maintain. Warning instead of refusing keeps users who update a week
late working.

### D24. The master key: its format, its checks, and when it's required

`secrets` (D20) takes one master key, exactly 32 bytes in canonical standard base64, from
`COMRADARR_SECRET_KEY` or `COMRADARR_SECRET_KEY_FILE`; setting both is an error. Startup refuses a
key whose bytes have at most 4.0 bits of Shannon entropy per byte, step by one constant amount, or
are all printable ASCII; there is no denylist. The key is imported only as HKDF input, and each use
derives its own key under its own label: the AES-256-GCM key, a 16-byte key ID and, in `setup`, the
role passwords (D17). A stored value is one text value, `v1.<key id>.<nonce>.<ciphertext and tag>`,
with `NULL` for none, and decrypts only under the table, field, row and app it was written for.
There is no rotation: the key ID D20 asks for makes a value written under another key fail with
its own clear error, and a new key means entering the stored secrets again. `secrets` checks the key
in SvelteKit's `init` hook from its first version, so every way of running the app, dev and CI
included, needs one. The details are in [SPEC-secrets.md](SPEC-secrets.md). The design is the same
in all five edbfi apps; only the variable prefix, the app name and the stored secrets differ.

Why: closes the open question of the capability map, whether the legacy weak-key checks (legacy
§11.3) join every app's key check, with safety first (owner decision, after a council of three
models and a review). Each kept check catches a real mistake (a padded or doubled short secret, a
counter, a passphrase), and together they refuse a random key about once in 62 billion. A denylist
adds upkeep without safety once no key is ever written in the repo. One encoding and an error when
both variables are set leave nothing ambiguous at startup. Deriving every key through HKDF keeps one
key out of two primitives now that D17 also derives role passwords from it. One self-describing
column can't come apart. Rotation is left out because the apps are rewritten from scratch with no
stored data to carry over, and a key change is rare enough to handle by entering a few secrets
again (owner decision). Checking the key from the first version makes it part of installing
comradarr from the start, rather than a surprise when a later module first stores a secret.

## Open

### D13. Producing the OpenAPI document

How the OpenAPI document is generated from SvelteKit endpoints isn't chosen. The generator must be
validated with the pinned TypeScript 6 and Bun versions. Closes when the first JSON endpoint needs a
generated client.

### D14. Logging library and job lifecycle

The logging library (D12) and the concrete job lifecycle implementation (D8) aren't chosen. Close
before the first background job lands.

### D15. Drizzle versions for Bun SQL

The exact Drizzle ORM and Drizzle Kit pair for `drizzle-orm/bun-sql` is still to be chosen and
validated in the app: migrations, type checking and production builds. The earlier stack comparison
ran Drizzle `1.0.0-rc.4` against PostgreSQL 18.6 (overlapping transactions, single-connection pool
queueing, contending row updates); that is history, not the pin. Closes with the first database
module.

### D16. Privilege matrix and append-only audit

The PostgreSQL role and privilege matrix (D7) and the append-only audit enforcement still have to be
implemented and tested, including that the runtime role can't change the schema or an audit row.
Choosing PostgreSQL makes this possible; it doesn't prove the role configuration is correct. Closes
with `setup`, which creates the roles (D17) and the audit trail.

### D18. Runtime validation gaps

Not yet validated for this stack: browser interaction with a real component, production containers,
realistic load, and job recovery after a restart. Hydration is validated: the e2e smoke test waits
for the hydrated app in Chromium against the built server, with no console errors.
A crash test doesn't prove recovery from power loss or storage faults. PostgreSQL backup and restore
hasn't been validated; the procedure (D17) is still to be tested, and the database and the master
key must be restored together. Each closes with the work that first depends on it.

### D19. One process

The deployment assumes one application process per database. Horizontal scaling, job coordination
across processes, a shared first-run claim and live updates across processes would need a new
design. Stays open as an accepted limit.
