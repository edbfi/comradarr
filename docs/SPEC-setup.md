# Spec: `setup`

**Status:** approved by the owner (2026-11-16) with PR #222's nine changes to the approved notes,
`drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11, and PostgreSQL 16 or later. Module 3 of the
capability map ([docs/SPEC.md](SPEC.md)). Ported from obzorarr, the reference app for `setup`
([Shared groundwork](../AGENTS.md#shared-groundwork)): from its spec before the cut
(`0fb3565:docs/SPEC-setup.md`), its spec, code and tests at `b59b909`, which include the follow-ups
#337–#342, and the build PRs #324–#333. Once built it closes D15, D16, the oldest PostgreSQL version
(D17), D14's logging half, the CSP's inline-style question, ground-floor choices 3 and 5, and the
minimum length and common-password parts of `sign-in`'s password rules.

**What differs from obzorarr:**
- **The database** is PostgreSQL through Drizzle and Bun SQL (D5), not embedded Turso: one owner
  URL, from which startup creates the app and audit-admin roles of D7 with passwords derived from
  the master key (D17), a pre-flight check, the role privileges and their tests (D16), and Drizzle's
  newest stable pair, since D25 allows no release candidate ([The database](#the-database)).
- **comradarr's additions in row 3:** the audit trail ([The audit trail](#the-audit-trail)), the
  health check with per-component status ([Health](#health)), the error format
  ([The error format](#the-error-format)), the CSP report endpoint
  ([The CSP report endpoint](#the-csp-report-endpoint)), the request id and one log line per
  request ([Logging](#logging)), and the check that rejects SQL built from strings.
- **A stricter policy:** style elements need the nonce, and only style attributes are allowed
  inline (`style-src-attr 'unsafe-inline'`), where obzorarr allows every inline style; plus the
  extra headers comradarr's notes add ([The content security policy](#the-content-security-policy),
  [Security headers](#security-headers)).
- **The token's banner** on the console, with its expiry time, the warning, and a link that carries
  the token in its fragment, removed from the address bar on arrival
  ([The bootstrap token](#the-bootstrap-token)).
- **The claim** shows which password rules a password already meets, and audits every attempt
  ([The claim](#the-claim)).
- **Unexpected errors** go through the logger's `handleError`, so they are redacted JSON lines like
  every other entry ([Logging](#logging)).
- **Moved here from `sign-in`, as obzorarr did:** `ORIGIN`, the cross-origin check and the password
  rules. **Moved to `sign-in`:** the claim's per-address limit, with every other rate limit
  ([Before `sign-in`](#before-sign-in)). Both change the capability map's rows 3 and 4.
- **Changes to comradarr's approved notes,** each for the owner to approve with this spec:
  - the CSP allows inline style attributes, where the notes allowed no `unsafe-inline` at all:
    SvelteKit, Svelte and Ark UI render style attributes on the server, and a probe showed that
    blocking them breaks pages ([The content security policy](#the-content-security-policy));
  - strict transport security never covers subdomains ([Security headers](#security-headers));
  - no console log format and no CSP report-only switch
    ([Configuration](#configuration-and-startup-checks));
  - the token's link is a full address only when `ORIGIN` is set, not `localhost` in place of an
    all-interfaces address, and the token can still reach the browser's history
    ([The bootstrap token](#the-bootstrap-token));
  - the password's strength shows as the rules it meets, not as a score ([The claim](#the-claim)).
- The app name, the `COMRADARR_` prefix, the claim page (its brief is comradarr's), and the decision
  numbers: comradarr's D12 is obzorarr's D11 (logs), D19 its D17 (one process), D24 its D26 (the
  master key) and D25 its D27 (dependencies).

**Reading the marks.** A bullet or clause marked "(comradarr)" is this app's own; the rest is the
shared wording, from obzorarr's spec. A "(comradarr)" mark inside a bullet covers the rest of that
bullet, and "(comradarr: …)" only its own parentheses. A section headed "(comradarr)" is
comradarr's own throughout.

## Objective

A fresh install starts safely and is claimed by its one owner (D20):
1. **Startup:** the configuration is checked, the database reached, checked, migrated and its roles
   set, and each module's startup work run, before any request is served; shutdown stops work,
   drains and closes cleanly.
2. **The database** (D5, D6, D7, D17): PostgreSQL through Drizzle, with reviewed migrations, the
   roles and their privileges, a settings store, the owner account and the audit trail.
3. **Logging** (D12): structured entries on standard output, redacted before they are written.
4. **The request checks:** the cross-origin check on every state-changing request, and the security
   headers and a nonce-based CSP on every response the app renders (ground-floor choice 3), with
   the CSP's report endpoint.
5. **First run:** the setup gate, the bootstrap token printed to the console, and the claim, which
   creates the owner account; every claim attempt is audited.
6. **Health** (comradarr): `/healthz` reports the overall and per-component status (ground-floor
   choice 5).

**Left out on purpose:** signing the owner in at the claim, sessions, the browser's address, rate
limits, cookies and the error pages (`sign-in`); the two-factor offer (`two-factor`); the client
address behind a proxy (`http-boundary`); every later first-run step. Until `sign-in` is built, a
claimed instance has no way to sign in, and first run ends at the claim
([Before `sign-in`](#before-sign-in)).

## Configuration and startup checks

Each of the app's own variables is read once, at startup, by its own file in `config/`, and
`src/env.ts` declares it (SvelteKit 3 exposes only declared variables). For these, an empty variable
counts as unset (D24's rule; `ORIGIN` differs, below), and a check that fails stops startup with one
line naming the variable and what is wrong, never echoing the value.

| Variable | Default | Checked |
|---|---|---|
| `COMRADARR_SECRET_KEY`, `…_FILE` | — | as `secrets` checks them (D24) |
| `COMRADARR_DATABASE_URL`, `…_FILE` (comradarr) | — | below |
| `ORIGIN` | unset | below |
| `COMRADARR_LOG_DEBUG` | off | `true` or `false` |

**The database URL** (comradarr) is a secret, so it follows the master key's rules: exactly one of
the two variables, setting both is an error, and a file is read once, at most 4 KiB, losing one
trailing newline. It must be a `postgres://` or `postgresql://` URL naming a user and a database;
its other parts (host, port, password, TLS parameters) are PostgreSQL's to check. Missing, it stops
startup (D17). Its role is the owner role ([Roles](#roles)).

**What the environment holds** (comradarr): only what must exist before the start. These variables,
`HOST` and `PORT` (adapter-bun's), adapter-bun's own variables below, and later `sign-in`'s
recovery switch (D20). Every other setting is stored in PostgreSQL, changed in the app, audited and
in effect at once, and a network setting is tested before it is saved (`http-boundary`). There are
no configuration files. Plain settings and secrets are stored apart: a secret is encrypted in its
own field (`secrets`), so reading plain settings never decrypts anything.

Two things comradarr's notes asked for are left out (comradarr):
- **A console log format for development:** the JSON lines read fine in a terminal and pipe to
  `jq`, and one format is one thing to test.
- **A report-only switch for the CSP:** its reason was development, and SvelteKit's dev server
  already relaxes the style policy for Vite's injected styles. The built server always enforces it.

**adapter-bun's own variables** are read and checked by the adapter (1.0.1), with its own defaults
and messages, which may echo a malformed value; the app adds no code for them, and the README lists
them:
- `SHUTDOWN_TIMEOUT` (default 30 s): the drain time. The container's stop timeout must exceed it
  plus the app's 5-second cleanup; the README says so, and its Compose example sets
  `stop_grace_period` (Docker's default is 10 seconds);
- `CONNECTION_IDLE_TIMEOUT` (default 10 s, at most 255 s): the idle timeout. The adapter already
  exempts event streams;
- `BODY_SIZE_LIMIT` (default 512 KB) (comradarr: takes no uploads, so it needs no change).

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. When set, it is a bare `http` or `https` origin (a trailing `/` is fine), compared as a
parsed origin. It is checked twice:
- **adapter-bun 1.0.1** reads it when the server module loads, before `init`, and uses it to
  correct SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own
  message, which includes the value, so a container image's entrypoint unsets an empty `ORIGIN` and
  its templates leave it out (the image's work; comradarr has no image yet).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials, checked on the raw text before parsing. An empty `ORIGIN` is refused too, since the
  adapter refuses it first. Startup stops with an error that doesn't echo the value.

The cross-origin check, the strict-transport decision, the token's link and `sign-in`'s browser's
address all use the one value `config/origin.ts` gives.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served, and is skipped
while building:
1. the master key (`secrets`, as now), which also derives the role passwords;
2. the configuration above;
3. the database (comradarr): connect as the owner role, the pre-flight check, the migrations, the
   roles and their privileges, then the check that the database knows every audit action; the owner
   connection closes, and the app role's pool opens ([The database](#the-database));
4. each module's startup work, in a fixed order. `setup`'s own: load first run's state and, if the
   instance is unclaimed, print the bootstrap token;
5. starting the jobs (none yet). A job that fails to start is logged, not fatal; (comradarr) a job
   does nothing until first run is complete.

A failure in steps 1–4 is logged and thrown from `init`: the built server exits non-zero before it
listens, and the dev server stays up with every request failing, as the key error already does.

(comradarr) **Waiting for PostgreSQL.** Containers start together, and PostgreSQL may not accept
connections yet. Step 3 keeps trying for 30 seconds in all, every 2 seconds, each attempt bounded by
the time left, while the failure is one waiting can fix: a refused or unreachable connection, a host
name that doesn't resolve yet (a Compose service starting), or PostgreSQL's "the database system is
starting up" (`57P03`). It logs the first failure at warning and gives up with an error. An
authentication or permission failure fails at once. The README's Compose example also waits for
PostgreSQL's health check (`pg_isready`), so the wait is only a backup.

**Shutdown.** adapter-bun 1.0.1 already drains open requests for `SHUTDOWN_TIMEOUT`, then closes the
rest, exits at once on a second signal, and emits `sveltekit:shutdown` without waiting for its
listeners. The app adds:
- **On the signal** (`SIGTERM`, `SIGINT`, and `SIGHUP`, which counts as a stop and is passed on to
  the adapter as `SIGTERM`): stop the jobs and timers (the token's included) and close open streams
  cleanly, so browsers reconnect, while the adapter drains.
- **On `sveltekit:shutdown`:** wait for the jobs stopped on the signal, close outbound connections
  and the database pool, then flush the logs (so a closing error is written) and exit 0, even after
  a failed close, which is logged.
- **A deadline:** if that cleanup hasn't finished 5 seconds after `sveltekit:shutdown`, the app
  exits non-zero anyway, after flushing its own entry for at most 250 ms, even with an upstream call
  still outstanding.
- **Only in the built server:** `dev` gets no handlers, because Vite never emits
  `sveltekit:shutdown` and a `SIGINT` listener would stop Ctrl+C from ending it. The handlers go in
  one turn after `init` resolves, after adapter-bun's own, so a signal never reaches only the app's.

(comradarr) **What later modules keep** (each moves to its module's spec when this one is reduced).
A job catches every error in a tick, logs it with its
context and carries on; a lasting failure shows as a deduplicated error and a health badge, not as
restarts. Everything that matters is in the database, so a crash loses nothing: sync resumes from
its timestamps and fingerprints, rotation from the last-searched times, and commands in flight are
polled again.

## The database

(comradarr) The whole section is comradarr's own; obzorarr's is one embedded file. D5, D6, D7 and
D17 hold the engine, the access rules, the roles and the deployment.

### Versions

`drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11, the newest stable releases (D25 allows no release
candidate, so obzorarr's `1.0.0-rc.5` isn't an option), exact-pinned dev dependencies, with
`drizzle-orm/bun-sql` on Bun's built-in `SQL` client, which needs no driver package. The build
validates the pair ([Validation](#validation)), which closes D15. If it fails, the build stops and
asks: another driver is a new dependency.

**PostgreSQL 16 or later.** The pre-flight check refuses an older server, naming the version it
found and the one it needs. 16 is the oldest whose `CREATEROLE` gives a role control over only the
roles it created, the rule the role set-up below relies on; 14 is out of support, and 15 is the one
that would keep a different set of rules to test. The tests and the Compose example use the newest
release (18 today).

### Roles

D17 in practice: the URL names the **owner role**, which owns comradarr's database and may create
roles. Startup uses it once, then closes it.
- **The pre-flight check,** before anything migrates or changes, names every missing requirement
  at once: the server's version, `CREATEROLE` (or superuser), owning the database (needed to create
  tables in its `public` schema and to grant `CONNECT`), role names that fit PostgreSQL's 63 bytes
  and differ from the owner role's own name, and, for a role that already exists under one of the
  two names, that the owner role administers it (on 16, one it created) and that it has no
  attribute the owner role may not remove (superuser, `CREATEDB`, `CREATEROLE`, replication,
  `BYPASSRLS`). Each refusal names the role.
- **The two roles** are named after the database, `<database>_app` and `<database>_audit_admin`
  (`comradarr_app` for a database named `comradarr`), because roles belong to the whole PostgreSQL
  server: a second comradarr on the same server, with its own database and key, must not reset the
  first one's passwords. Each logs in, with no other attribute (no superuser, database or role
  creation, no replication, no row-level-security bypass).
- **Their passwords** are derived from the master key (D17, D24), one HKDF label per role
  (`edbfi:database-role:v1:app` and `edbfi:database-role:v1:audit-admin`), as 43 characters of
  base64url. Startup creates a missing role and sets both passwords every time, so a restored
  database or a new master key needs nothing by hand. A password is sent as a SCRAM-SHA-256
  verifier computed in the app (a fresh random salt and PostgreSQL's 4096 iterations), never as
  text, so a server that logs its statements never logs a password (what `psql`'s `\password`
  does). Verifiers are never logged either.
- **The privileges** (D7, D16) are set after every migration from one matrix in `db/roles.ts`, on
  the tables of the `public` schema only (Drizzle's own migration records stay the owner role's):
  the app role gets exactly `SELECT`, `INSERT`, `UPDATE` and `DELETE` on every table, except
  `audit_log`, where it may only insert and read; the audit-admin role may only read and delete
  `audit_log` entries. Neither gets `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN`, a
  membership in another role, or anything it owns, so neither can change the schema. Startup also
  revokes `PUBLIC`'s `CREATE` on the `public` schema and `TEMPORARY` on comradarr's database, which
  an older or upgraded database may still grant. A table a later migration adds gets the app role's
  privileges without a new rule.
- **At runtime** requests and jobs use the app role's pool, built from the owner URL with the user
  and password replaced, so host, port and TLS parameters carry over. `audit-log`'s retention sweep
  later connects as the audit-admin role on a short connection of its own. Each role logs in
  separately: switching roles on one connection (`SET ROLE`) would let an injected statement switch
  back.
- A server whose `pg_hba.conf` doesn't let the new roles in fails with an error naming the role,
  and the README says what to allow.

### Access and migrations

**Access** follows D6: the client in `db/client.ts` opens the pool; each aggregate's file in `db/`
holds its tables and its named operations; services own the transactions, and every statement in
one goes through its transaction object.

**Parameterised queries only.** Every query is parameterised. `db/parameterised.test.ts` searches
`src/` and fails on SQL built from strings: `sql.raw`, a client's `unsafe`, or text joined or
interpolated into SQL outside a `sql` tag. Values interpolated in Drizzle's or Bun's `sql` tagged
template are parameters, and pass; the test plants one of each to show both. Its exceptions are
`db/roles.ts`, whose statements (`CREATE ROLE`, `ALTER ROLE … PASSWORD`, `GRANT`) can't take
parameters, so every identifier passes through one quoting function and every literal is a verifier
the app computed, and `db/migrate.ts`, which runs the reviewed migrations. (A Biome rule would
change the shared `biome.json`.)

**Migrations** are generated by Drizzle Kit from the schema (`bun run --bun db:generate`, which then
formats its JSON with Biome), reviewed and committed in `drizzle/`. They only go forward. The built
server applies them at startup, as the owner role, from its own bundle: Vite bundles each
migration's SQL and Drizzle Kit's journal (`?raw`), and `db/migrate.ts` applies the pending ones in
one transaction with Drizzle's own bookkeeping, so a failure names its migration (D15). A test
compares its records with Drizzle Kit's own migrator's.
- **A pending migration** logs which ones it applies, with a reminder that a backup comes before an
  upgrade;
- **a failed one** stops startup with its name and PostgreSQL's reason, and a non-zero exit;
- **going back** means restoring that backup and running the previous version, never running an
  older version on a migrated database;
- (the audit enum) pending migrations run in one transaction, and PostgreSQL won't use an enum
  value in the transaction that adds it, so a migration never uses an audit code that it or
  another migration in the same release adds.

### Tables

Each with `drizzle/`'s first migration:
- **`settings`:** key, value (text) and update time, through named operations to read and write a
  key. `setup` stores first run's step pointer here; later modules add their own keys.
- **`owner`:** one row at most, enforced by the schema (a fixed id checked to be 1): username,
  password hash and creation time. `two-factor` and `oidc-sign-in` add their fields.
- **`audit_log`** (comradarr): [The audit trail](#the-audit-trail).

## The audit trail

(comradarr) One service, `services/audit/record.ts`, writes every entry, from the first claim
attempt on. An entry has:
- its time, from the database;
- an **action code** from one documented list that only grows: a PostgreSQL enum, `audit_action`,
  which migrations only add values to, and the same list in `services/audit/actions.ts`. Startup
  checks that the database knows every code in the list, and stops if one is missing, naming it;
- the **actor**: the owner; nobody, when the client address is who acted; or the app itself, for
  an entry startup or a timer writes;
- a **context** of a fixed shape per action, typed in `actions.ts`, passed through the log
  redaction before it is written, so no secret reaches it;
- the **client address** (the connection's address until `http-boundary` resolves proxies), the
  **user agent**, cut to 512 characters, and the **request id**, which links the entry to the
  request's log lines; all three are empty in an entry the app itself writes.

Entries are indexed by time, overall and by action, and read newest first (`audit-log` reads them).
The app role can only add and read them (D7).

`setup` records:

| Code | When | Context |
|---|---|---|
| `setup.token_printed` | a bootstrap token is printed | its expiry time, never the token |
| `setup.claim_attempted` | every claim attempt while unclaimed | the outcome: `granted`, `invalid`, `wrong_token`, `expired_token` or `failed`; `sign-in` adds `rate_limited` |
| `setup.owner_created` | the claim creates the owner | the username |
| `setup.first_run_completed` | first run completes | — |

The three entries of a granted claim are written in the claim's own transaction, so a claim never
completes unaudited. Any other entry is written on its own; if that write fails, the failure is
logged as an error and the request answers as it would have.

**What later modules record** (comradarr's notes; each moves to its module's spec when this one is
reduced after the build): every sign-in attempt with its method; sign-out;
ending sessions; password changes; recovery; creating, first using and revoking API keys; adding,
editing, deleting, pausing and resuming connectors (the URL and type, and only that the key
changed, never the key); `http-boundary` changes with old and new values; OIDC settings;
notification channels, routes and templates; settings and secret changes; syncs and searches
started by hand; and pausing and resuming the rotation or an item. Routine sync and rotation ticks,
health probes, single dispatches and single notification deliveries go to the log instead; an
action is recorded in exactly one of the two.

**An accepted risk:** until `sign-in` brings the claim's limit, and after it too, since a refused
attempt is still audited, anyone who can reach an unclaimed instance can add audit entries. The
window closes at the claim, after which the claim answers "not found" and records nothing.

## Logging

Four levels, debug dropped unless `COMRADARR_LOG_DEBUG` is on. Each entry is one JSON line on
standard output (D12) with a level, a message, a source, structured metadata and a millisecond
timestamp. `logging/` is the app's own small logger, with no library, which closes D14's logging
half: the redaction rules below need key matching at any depth that path-based library redaction
doesn't give, and the entry's shape is fixed here. Unflushed entries are flushed at shutdown.

**Redaction** runs before an entry is written:
- credentials in URLs, and token-like query parameters, also inside a parameter's value once
  percent-decoded (up to three times); such a value is redacted whole;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key,
  except the names `redact.ts` lists as holding no credential, whose values are still cleaned like
  any other (comradarr: the list starts empty; the first module that logs such a name adds it, and
  only a name comradarr logs);
- a `Secret` (`secrets`) is already `[redacted]`;
- (comradarr) secret-shaped values wherever they appear: argon2 password hashes, three-part
  tokens (`xxx.yyy.zzz` in base64url) and stored ciphertexts (`v1.<key id>.…`, `secrets`); the
  API-key header and the API-key prefix pattern join when `api-keys` defines them.

Name splitting and every scan run in linear time; a growth test checks it under load.

(comradarr) **Each request** gets an id (a random UUID) when it arrives, kept for the request in
`AsyncLocalStorage` like the language, so every entry written while handling it carries
`requestId` without being passed it. When the response is ready, one `info` entry records the
method, the path with query values removed (`?page=&q=`), the status, the size when known, the time
taken and the client address; `/healthz` is logged at debug, since probes would drown the log.
Responses produced before `handle` (the built files) aren't logged.

(comradarr) **Unexpected errors** in a load, action or endpoint reach SvelteKit's `handleError`,
which logs them through the logger, with the request id from `event.locals`, and returns a
generic message with the request id. Without it, SvelteKit prints them with `console.error`,
unredacted and not as JSON.
An error is logged as its name, message, cause and stack, all cleaned, never its local variables.

Console output meant for whoever runs the server, such as the bootstrap token's banner, is never a
log entry. It still reaches the container's output, which is why the console is trusted (below).

(comradarr) **What later modules keep** (as above): debug is internal state, info routine events (a
sync finished with its counts, a rotation tick's summary), warning a recoverable surprise and error
an actual failure; there is no fatal level, because an unrecoverable condition exits. Context such
as the connector or the sync type is bound once per boundary, as the request id is, and event names
form a hierarchy that is easy to search. A loop logs one summary per tick, and a repeated error is
logged once when it starts, then rarely, then once when it clears: the first module with a job
builds that, with an error fingerprint to recognise the repeat. Request and response bodies are
never logged. Who changed what, and any user's identity, go to the audit trail, not the log.

## The request checks

`handle` runs its stages in this order (comradarr: after the request id's): the language
(`i18n`), the security headers, the cross-origin check, then the setup gate. `sign-in` later adds
its stages between the cross-origin check and the gate, and `http-boundary` resolves the client
address after the language (SPEC.md's `sign-in` notes, "Request order"). Every refusal is returned,
never thrown ([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it keeps the language and the
headers.

### The cross-origin check

Brought forward from `sign-in`'s Module notes, as obzorarr did, because the claim is the first form:
SvelteKit's own check compares the browser's `Origin` with `event.url`, which adapter-bun builds as
`https` unless `ORIGIN` or a protocol header says otherwise, so it would refuse the claim over plain
HTTP.
- **SvelteKit's own form check is off:** `sveltekit({ csrf: { trustedOrigins: ['*'] } })` in
  `vite.config.ts` (SvelteKit 3 takes its options in the `sveltekit()` call, with no `kit:`
  wrapper). Remote functions stay off. A config test asserts both, so SvelteKit's only remaining
  check before `handle` is the remote-function one, which nothing uses. The cross-origin check
  replaces SvelteKit's form check.
- **The cross-origin check** asks the browser, so the app doesn't need to know its own address and
  stores none. It is the first check in `handle`, after only the language (`i18n`), for every
  method except GET, HEAD and OPTIONS, and for every content type (form, JSON, multipart,
  `text/plain`, empty). Internal `event.fetch` subrequests (`event.isSubRequest`) skip it.
  (comradarr: it replaces the legacy app's origin check against a stored list and its exemptions;
  the claim and the CSP report endpoint are checked like any other POST.)
  - An `Origin` header, whenever it is present, must parse as one bare `http` or `https` origin;
    `null`, a malformed value, several values, or a value the URL parser would repair (a
    backslash, a bare trailing colon, `https:host`) are refused. This applies on every branch
    below.
  - With `ORIGIN` set, a present `Origin` must equal `ORIGIN`, compared as parsed origins. Without
    `Origin`, `Sec-Fetch-Site` must be `same-origin` or `none`.
  - With `ORIGIN` unset, a present `Sec-Fetch-Site` passes only as `same-origin` or `none`
    (`same-site` and `cross-site` are refused). Otherwise `Origin`'s host and port must equal the
    `Host` header, with default ports normalised. Browsers send `Sec-Fetch-Site` only to HTTPS,
    `localhost` and loopback addresses, so over plain HTTP outside loopback every browser gets
    this comparison.
  - A request with neither `Origin` nor `Sec-Fetch-Site` doesn't come from a browser. It passes only
    on an explicit list of machine routes (comradarr: the JSON API with a valid API key, which
    `api-keys` adds; until then the list is empty, so every such request is refused), each with the
    credentials the app's approved docs require. The session cookie is never honoured on it: such a
    request that carries only a session cookie gets a 403.
  - A refusal is a 403 with the app's own "Access denied" page, or (comradarr: the error format's)
    JSON error for JSON callers, with the security headers and in the viewer's language. Until
    `sign-in` builds the error pages, the page is the title and its one-line description.
- **When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
  HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
  16.4, Firefox before 90, Chrome before 76). The proxy fix is `proxy_set_header Host $http_host`
  (not `$host`, which drops a non-default port). Remote functions would need it too; they stay
  off. The README gives the fix.
- **Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
  from `https`, which is harmless on a port that speaks only HTTP; over HTTPS it affects only
  browsers without `Sec-Fetch-Site`, and only against a network attacker, and HSTS or `ORIGIN`
  closes it. DNS rebinding reaches only actions that need no sign-in, because cookies don't follow
  a rebind, and those are gated by a console token or rate-limited.

`security/cross-origin.ts` is one pure module, copied from obzorarr as D20 shares the opening
modules. **For `api-keys`:** obzorarr's module, copied unchanged, refuses a request with neither
header on its `ORIGIN` branch, before the "neither header" rule is reached, so once `ORIGIN` is set
it would refuse every machine-to-machine request (an API key, a webhook). When `api-keys` adds
comradarr's machine routes, their rule runs first, whether or not `ORIGIN` is set, as zimuarr's
port does.

### Security headers

On every response that passes through `handle`, early returns and error pages included:
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: same-origin` (never `no-referrer`, which makes browsers send `Origin: null` on
  the app's own form posts);
- `Permissions-Policy` denying camera, microphone and geolocation (comradarr: and every other
  powerful feature the app doesn't use, listed in `headers.ts`; writing to the clipboard stays
  allowed for the copy buttons later modules add);
- `Strict-Transport-Security: max-age=31536000` over HTTPS only, known when `ORIGIN` is `https`, or
  when `ORIGIN` is unset and the browser sent `Sec-Fetch-Site` to a host that isn't `localhost`,
  `*.localhost` or a loopback address (`127.0.0.0/8`, `[::1]`), since browsers send it only to
  HTTPS and those hosts. Never `includeSubDomains`: other apps may share the domain (comradarr:
  this reverses the notes, which asked for it; Sonarr or Radarr on a subdomain over plain HTTP
  would become unreachable from that browser for a year). Never `preload`, which is the
  operator's decision. An accepted risk: HSTS covers every port of the host name, so another app on
  the same host over plain HTTP becomes unreachable from that browser until it moves to HTTPS;
- (comradarr) `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy:
  same-origin`;
- (comradarr) no `Server` or `X-Powered-By` header, which a test asserts.

(comradarr) No setting turns them off or changes them.

### The content security policy

On every page, through SvelteKit's `csp` option in `vite.config.ts`, in nonce mode. No page is
prerendered (`i18n` already forbids it), so every page gets its own nonce:
- `default-src 'self'`, so a directive not listed falls back to the app;
- `script-src 'self'` with the nonce, so only the app's scripts run;
- (comradarr) **styles:** `style-src 'self'` and `style-src-elem 'self'`, with the nonce
  SvelteKit adds when it inlines a `<style>`, and `style-src-attr 'unsafe-inline'` for style
  attributes alone (below);
- `img-src 'self' data:`;
- `font-src 'self'` (DESIGN.md bundles the fonts);
- `connect-src 'self'`;
- `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'` (no plugins), `base-uri
  'self'`, `form-action 'self'`;
- (comradarr) the report endpoint, through `report-uri` only
  ([The CSP report endpoint](#the-csp-report-endpoint));
- (comradarr) never `unsafe-inline` in `script-src`, `style-src` or `style-src-elem`, never
  `unsafe-eval`, and never `upgrade-insecure-requests`, which would break a plain-HTTP install at
  home. A dependency that needs any of them is refused.

(comradarr) **Why style attributes are allowed.** The notes asked for no `unsafe-inline` at all and
left open how the style attributes Ark UI and Svelte write fit. A probe on the built server
(Chromium, with Ark's Dialog, Popover, Tooltip, Menu, Select, Combobox, Progress and Switch, a
transition and `style:` directives) answered it:
- **Blocking style attributes breaks pages:** SvelteKit's route announcer, `src/app.html`'s
  wrapper, every `style:` directive and Ark's server-rendered parts all carry them. Svelte's
  hydration skips writing a style equal to the blocked attribute, so a literal one never recovers,
  a `style:` value stays wrong until it changes, and Ark's parts flash and shift until hydration.
  Chromium also reports every static style attribute in a client-rendered template, so the report
  endpoint would fill with noise.
- **Allowing style attributes alone** gives no violation at load or during use, and every page
  matches one served with no policy. Positions Ark computes go through the CSSOM, which the policy
  doesn't govern, and Svelte's transitions use `element.animate()`, which injects no `<style>`.
- **The risk it keeps:** injected markup could restyle part of a page to mislead, but a style
  attribute can't run code, the selector tricks that read attribute values need a `<style>`
  element, which still needs the nonce, and a `url()` in one still obeys `img-src` and `font-src`.
  obzorarr's `style-src 'unsafe-inline'` allows style elements too.
- Browsers without `style-src-attr` (Firefox before 108, Safari before 15.4) fall back to the
  strict `style-src`: the same flash, nothing worse.

**A page a `handle` stage builds itself,** such as the cross-origin refusal, never passes through
SvelteKit's renderer, which adds the policy above and fills `<html lang>`. The stage sets both
itself, with a fixed, stricter policy, since the page has no scripts and (comradarr) no styles: it
sets its dark colour scheme with `<meta name="color-scheme">`, not a style: `default-src 'none';
frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.

**A limit:** responses produced before `handle` carry none of these headers: the built files
(scripts, styles, fonts, `static/`), which adapter-bun serves itself, and the adapter's own 400 and
413 answers. None is a document, so framing and the CSP don't apply to them, and Bun sends each file
with its real content type.

### The CSP report endpoint

(comradarr) `POST /api/csp-report` needs no session and works before setup (the gate lets it
through). The policy names it with `report-uri` alone: the probe showed that Chromium, once a policy
also has `report-to`, ignores `report-uri` and, over plain HTTP, sends nothing at all. A browser's
report passes the cross-origin check like any POST: it carries `Origin`, and over plain HTTP outside
loopback no fetch metadata, so `Origin` must match `Host` (or `ORIGIN`). The endpoint takes only
`application/csp-report`, up to 16 KB read with a cap whatever the declared length, and logs each
violation at warning with bounded context: the directive, the blocked address's origin, the page's
path without its query, and the line, each string cut to 200 characters. Everything that passes the
cross-origin check gets a 204, accepted or not, so a prober learns nothing. `sign-in` adds its
per-address limit.

### The error format

(comradarr) Every error the app answers in JSON has one shape, in `lib/shared/errors/`, so pages
and later clients read one thing:

```json
{
  "type": "access_denied",
  "title": "Access denied",
  "status": 403,
  "detail": "…",
  "requestId": "…",
  "fields": { "username": "…" },
  "context": {}
}
```

- **`type`** is a stable id and also its message key: its title and detail are the messages
  `error_<type>_title` and `error_<type>_description`, translated into the viewer's language.
- **`fields`** holds per-field errors for a validation failure, and **`context`** the domain's
  context; both are left out when empty. `connectors` adds `retryable` for a connector error.
- `setup` uses it for the cross-origin refusal (`access_denied`), the gate's answer to JSON callers
  (`setup_incomplete`) and unexpected errors (`internal_error`, with no detail beyond the request
  id). `sign-in`'s error pages show the same messages.

## Health

(comradarr) `GET` and `HEAD /healthz` replace the fixed `ok` (ground-floor choice 5). No session is
needed, the gate lets it through, and it carries `cache-control: no-store`. The answer is minimal,
with no versions, timings or errors:

```json
{ "status": "healthy", "components": { "database": "healthy" } }
```

- The database component runs `select 1` on the app role's pool with a 2-second limit: `healthy`,
  or `unavailable`.
- The overall status is the worst component's. `healthy` and `degraded` answer 200; `unavailable`
  answers 503, since the database is critical. `setup` has no component that can be `degraded`;
  later modules add theirs (connectors, indexers), and say which are critical.
- `sign-in` adds its per-address limit.

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
except the current first-run step, `/healthz`, (comradarr: the CSP report endpoint) and the
responses produced before `handle` gets a 303 to that step (owner sign-in with its two-factor
challenge, recovery and first run's own helpers join the exceptions when their modules add them;
the OpenAPI document never does). (comradarr) A JSON caller, one that asks
for JSON and not for a page, gets a 503 `setup_incomplete` instead, never a 401. It reads first
run's state from memory, which startup loads and the claim updates (one process, D19).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't
skip ahead: each step's action checks that it is the current step, a step that offers Previous only
moves the pointer back, and only the last step's action completes first run. Every step after the
claim needs the owner's session, which `sign-in` brings. (comradarr) The pointer is stored and
compared exactly: any change to setup state, creating the owner included, writes it, so an
interrupted first run is still gated after a restart, and nothing is inferred from an owner account
existing. Until Verify access passes, every signed-in page goes back to it (`http-boundary`, D20).

### The bootstrap token

D20:
- 12 random lowercase letters and digits, drawn without bias from WebCrypto, shown as
  `xxxx-xxxx-xxxx`;
- held only in memory: never in a log entry, the database, the audit trail or a response;
- printed to standard output at startup while the instance is unclaimed;
- valid for 15 minutes, after which a new one is printed; a timer that shutdown stops, and that
  waits while a claim is in progress. A restart prints a new one;
- entered with or without the dashes, in any case, with spaces around it trimmed, and compared in
  constant time;
- once the instance is claimed, none is printed again.

(comradarr) **The banner.** Each token is printed as a short block of plain lines, not a log entry:
a rule with "Comradarr setup", the token with its expiry time in UTC, the link, and a warning that
this output is a setup secret, not to be pasted into chats or issue trackers. Every printing is
audited (`setup.token_printed`).

(comradarr) **The link** carries the token in its fragment, `/setup#token=xxxx-xxxx-xxxx`, which
browsers never send to the server, a proxy's access log or a referrer. It is a full address only
when `ORIGIN` is set; otherwise the banner prints the path and says to open it at the address
Comradarr is reached at, as obzorarr does. The notes asked for `localhost` in place of an
all-interfaces address, but in a container the address and port the server listens on are rarely
the browser's, and a wrong link misleads more than a path. The page fills the token in from the
fragment and removes it from the address bar at once (`history.replaceState`); without JavaScript
the person types it. The notes asked that the token never reach the browser's history, which no
page can promise: the visit is recorded before the page runs. It is single-use and lasts 15
minutes.

### The claim

`/setup`, the first step, a POST form action. In this order:
1. **The fields:** after the form is read, the username and password are checked against the rules
   below, with nothing awaited. A field error leaves the token unused.
2. **The token:** checked and used up, with no `await` between the two. A wrong or expired token
   gets one error, "That setup token isn't valid. Use the newest one printed in the server
   console.", and never reaches the hash, so a guess costs the server nothing. (comradarr: the audit
   entry tells the two apart.)
3. **The hash** of the password.
4. **One transaction** creates the owner, moves the step pointer and (comradarr) writes the granted
   claim's audit entries; its insert fails if an owner exists.

If anything after the token is used up fails while the instance is still unclaimed, a new token is
printed, unless shutdown has begun. A failed claim keeps the typed username and clears the token and
password. The claim stores no address of its own (the browser's address), and nothing but the owner
row, the pointer and (comradarr) the audit entries. (comradarr) Every attempt is audited, and
setup's endpoints never log request bodies.

**After it,** the claim no longer exists: `/setup` answers "not found" once first run is complete
(D20), and the claim action answers it whenever the instance is claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **Username:** trimmed and normalised to Unicode NFC, then 1–64 characters (Unicode code points),
  no control characters (`\p{Cc}`). Stored in that form, case kept, and compared after
  `toLowerCase()`, so case doesn't matter.
- **Password:** normalised to NFC, then 15–128 characters (Unicode code points), any characters,
  no composition rules. It may not contain, ignoring case, the app's name or, when the username has
  4 or more characters, the username; it may not be, as a whole, one unit of up to 4 characters
  repeated or one straight run up or down (each code point lower-cased on its own); and it may not
  be on the bundled list of common passwords. 15 is NIST SP 800-63B-4's minimum for a password that
  is the only factor, which it is until two-factor is turned on.
- **The common-password list,** `security/common-passwords.txt`, copied from obzorarr: the entries
  of 15 to 128 characters of SecLists' `xato-net-10-million-passwords-1000000.txt` (MIT licence) at
  the commit `password.ts` names, with its rebuild recipe. Vite bundles it with `?raw`. NIST
  requires checking a blocklist, and length alone accepts the long passwords such lists hold.
- **Hashing:** `Bun.password` with argon2id and Bun's defaults (comradarr's notes: parameters fixed
  in the code, never a setting, and stored in each hash), of the NFC form, so `sign-in` verifies
  what was hashed. The password is never logged or returned.
- **The form** has one password field with a control that shows what was typed, and no
  confirmation field.
- (comradarr) **How strong it is,** shown as the requirements it meets, not a score. Below the
  password field, a short list updates as the person types: 15 to 128 characters (with the count
  so far), not a repeat or a straight run, and without "Comradarr" or (from 4 characters) the
  username, and it says that common passwords are checked on submit. These rules live in
  `lib/shared/password-rules.ts`, which the browser and `password.ts` both use, and a test keeps the
  two in agreement, so the page never shows a password as meeting the rules that the server refuses
  for one of them. The common-password list stays on the server. No strength estimator: it would be
  a dependency, and its score would disagree with the rules.

**Trust:** anyone who can read the server console can claim a fresh install. (comradarr) Restarting
the app needs the same trust, so a restart printing a new token adds nothing.

## Before `sign-in`

`setup` is built before `sign-in`, which brings the rest of the protections. Until then:
- **Rate limits:** none. The token has 62 bits and lasts 15 minutes, and a wrong token costs no
  hash, so guessing it isn't practical. (comradarr) The capability map gave `setup` the claim's
  per-address limit; it moves to `sign-in`, which builds the counters every limit shares (in memory
  and in PostgreSQL) and the limits on the CSP report endpoint and the health check, as obzorarr
  does. Behind a proxy every request shares the proxy's address until `http-boundary`, so a limit
  built here would let anyone on the network use up the owner's claim attempts. Moving it doesn't
  solve that: the claim always comes before Verify access, so it never sees a resolved client
  address. `sign-in`'s claim limit must therefore not let one address shared by everyone keep the
  owner from claiming (generous, or tied to the token's lifetime).
- **The browser's address and cookies:** the claim sets no cookie yet, so it needs neither. Once
  `sign-in` starts the owner's session at the claim, the claim needs the browser's address, and the
  session follows `sign-in`'s cookies.
- **First run ends at the claim,** its only step: the claim completes first run and sends the
  browser to `/`. `sign-in` signs the new owner in at the claim, and `two-factor` adds the first
  step after it, from which on the claim no longer completes first run.

No release is cut between `setup` and `sign-in`.

## Validation

The build runs these checks with the pinned versions, and records the evidence in its PR body:
- **D15, migrations:** Drizzle Kit generates the first migration from the schema; the built server
  applies the bundled migrations to a new database, records them as Drizzle Kit's own migrator
  would (a test compares the two), and on a second start finds nothing to apply.
- **D15, type checking:** `check` passes with the schema, client and operations.
- **D15, the production build:** `bun --no-install ./build` reaches PostgreSQL with no
  `node_modules`.
- **D15, rollback isolation** (D6): a transaction that rolls back leaves a concurrent, unrelated
  write in place.
- **D16, the privileges,** on PostgreSQL 16 and 18: as the app role, inserting and reading
  `audit_log` work, and updating, deleting or truncating it, altering or dropping any table,
  creating a table or a temporary table, reading Drizzle's migration records and `SET ROLE` to
  another role are refused; as the audit-admin role, reading and deleting `audit_log` work and
  everything else is refused; the effective privileges (`has_table_privilege` and the like) match
  the matrix, also on a database whose `public` schema still grants `CREATE` to `PUBLIC`; the
  pre-flight check names a missing `CREATEROLE`, a database the owner role doesn't own, a
  PostgreSQL older than 16, and an existing role the owner role can't administer or that has an
  extra attribute.
- **D18, backup and restore,** with the README's exact commands: a claimed instance from the
  Compose example is dumped with `pg_dump --no-owner --no-privileges`, restored as the new owner
  role into a new database on a new PostgreSQL that has no comradarr roles, and started with the
  same master key. Startup recreates both roles and their privileges; the owner and the audit
  history are there, and the privilege checks above pass again.
- **No Node:** all of it with no `node`, `npm` or `npx` on `PATH`.

## Project structure

```text
src/env.ts                                  + COMRADARR_DATABASE_URL, …_FILE, ORIGIN,
                                            COMRADARR_LOG_DEBUG
src/app.d.ts                                App.Locals (request id), App.Error (request id)
src/hooks.server.ts                         init: startup; handle: request id, language,
                                            headers, cross-origin check, setup gate;
                                            handleError
src/lib/server/config/database-url.ts       the owner URL, from the variable or the file
src/lib/server/config/origin.ts             ORIGIN, parsed and checked
src/lib/server/config/log-debug.ts          COMRADARR_LOG_DEBUG
src/lib/server/config/config-error.ts       the error every variable check throws
src/lib/server/db/client.ts                 the pools: the owner's at startup, the app role's
src/lib/server/db/preflight.ts              the owner role's checks
src/lib/server/db/roles.ts                  the roles, their passwords and the privilege matrix
src/lib/server/db/migrate.ts                applies the bundled migrations
src/lib/server/db/settings.ts               the settings table and its operations
src/lib/server/db/owner.ts                  the owner table and its operations
src/lib/server/db/audit.ts                  the audit table, its enum and its operations
src/lib/server/db/parameterised.test.ts     no SQL built from strings
src/lib/server/logging/logger.ts            levels, entries, the request context, standard output
src/lib/server/logging/redact.ts            the redaction rules
src/lib/server/security/bootstrap-token.ts  the token: drawing, formatting, comparing, expiry
src/lib/server/security/cross-origin.ts     the cross-origin check
src/lib/server/security/access-denied.ts    the refusal: the page or the JSON error
src/lib/server/security/headers.ts          the security headers for a request
src/lib/server/security/password.ts         the credential rules, the list, hashing, verifying
src/lib/server/security/common-passwords.txt
src/lib/server/security/secrets/keyring.ts  + the role passwords
src/lib/server/services/audit/actions.ts    the action codes and their contexts
src/lib/server/services/audit/record.ts     the one writer
src/lib/server/services/setup/startup.ts    the startup steps and shutdown
src/lib/server/services/setup/first-run.ts  the steps, the pointer, the token and the gate
src/lib/server/services/setup/claim.ts      the claim
src/lib/server/services/health.ts           the components and the answer
src/lib/shared/errors/problem.ts            the error format
src/lib/shared/password-rules.ts            the rules the browser can check
src/routes/setup/+page.svelte               the claim form
src/routes/setup/+page.server.ts            its load and the claim action
src/routes/setup/token-format.ts            the token field's dashes as it is typed
src/routes/api/csp-report/+server.ts        the CSP report endpoint
src/routes/healthz/+server.ts               the health answer
drizzle/                                    the reviewed migrations
drizzle.config.ts
tests/e2e/setup.test.ts                     first run and the request checks on the built server
tests/e2e/global-setup.ts                   claims the instance for the other tests
tests/database.ts                           a PostgreSQL for the tests (below)
```

The build also changes `package.json` (the two packages and `db:generate`), `vite.config.ts` (the
form check off and the CSP), `playwright.config.ts` (a database per run, the token captured from
the server's output, the global setup), `messages/` (the claim page's text, `setup_…`, and the
errors', `error_…`), the README (the variables, the database and its roles, the Compose example,
`ORIGIN` and the proxy fix, first run, and backups). No CI change is expected, since GitHub's
runners have Docker; if one turns out to be needed, it goes to the owner first.

The claim page follows its brief, [`route-setup.md`](../.impeccable/surfaces/route-setup.md), and
shows the language switcher.

## Testing strategy

**A PostgreSQL for the tests** (comradarr). The unit tests that touch the database, and the e2e
server, need a real PostgreSQL (SPEC.md, "Each module's tests"). `tests/database.ts` provides it:
- **Where:** `COMRADARR_TEST_DATABASE_URL` when it is set, a URL for a role that may create
  databases and roles (a superuser, or `CREATEDB` and `CREATEROLE`) on a server the developer runs;
  otherwise it starts `postgres:18` with Docker, labelled, with `--rm`, on a free port so parallel
  worktrees don't collide, and removes containers a crashed run left behind, found by their label.
  The role and privilege tests also run on `postgres:16`, the oldest accepted.
- **Isolation:** each test file gets its own new database, owned by its own new owner role, and
  the run drops every database and role it created, the derived app and audit-admin roles
  included, and nothing else.
- **Without either,** the run fails with a message naming the variable and Docker; it never skips,
  which would weaken the hook. CI's runners have Docker, so CI needs no PostgreSQL service of its
  own.

- **Unit (Vitest, `node`):**
  - each `config/` reader;
  - the redaction rules, one case each and nested, with the linear-time growth check;
  - the request context: entries written during a request carry its id, and the request's line;
  - the headers for HTTPS, plain HTTP, loopback and `ORIGIN`;
  - the cross-origin check against a matrix of methods, content types and `Origin`,
    `Sec-Fetch-Site`, `Host` and `ORIGIN` values, and the config test for SvelteKit's options;
  - the error format and the refusal in both languages;
  - the token's format, alphabet, bias, expiry and comparison;
  - the credential rules at their limits, NFC and case included, the patterns and the list, and
    `password-rules.ts` agreeing with `password.ts`;
  - the shutdown order and deadline, with a cleanup that never finishes;
  - against PostgreSQL: the pre-flight check's refusals; the roles created, their passwords set as
    verifiers (the app role logs in with the derived password) and set again under a new key; the
    privilege matrix (Validation, D16); migrations on a new database and on a second start; the
    audit enum check stopping startup when a code is missing; the claim: success with its three
    audit entries; a field error leaving the token unused; a wrong and an expired token never
    reaching the hash, each audited with its outcome; a second claim; two at once leaving one owner
    and one granted entry; a failed transaction printing a new token and leaving no audit entry of
    the grant; a restart reading the pointer back; the gate's decision for each path and for JSON
    callers; the health answer with the database up and down;
  - `db/parameterised.test.ts`, which fails on a planted `sql.raw`.
- **e2e (Playwright, against the built server):** the web server starts with a generated key and a
  new database on the tests' PostgreSQL. Its `wait.stdout` pattern runs from the banner's token
  line through adapter-bun's "Listening on" and replaces the `url` check, because Playwright races
  the two and the URL could win before the token is captured. The global setup claims the instance
  through the form in a browser, so the smoke and language tests run on a claimed instance as
  before. `setup.test.ts` starts its own fresh servers and checks that:
  - every page sends a fresh instance to `/setup`, a JSON caller gets the 503, and `/healthz` and
    the report endpoint still answer;
  - the link's fragment fills the token in and leaves the address bar as `/setup`;
  - a wrong token is refused, the password rules show as they are met, the right token, typed in
    upper case without dashes, claims, and `/setup` then answers 404, also after a restart;
  - a cross-site form POST is refused, and a same-origin POST with no `Sec-Fetch-*` headers passes,
    both on `localhost` and on a plain-HTTP host name that isn't loopback (Chromium's
    `--host-resolver-rules="MAP app.test 127.0.0.1"`);
  - the headers are on a page, `/healthz`, a 404, a refusal and the gate's redirect, HSTS isn't over
    plain HTTP, and no `Server` or `X-Powered-By` header is sent;
  - the policy, directive by directive; the page's scripts carry the nonce; the refusal page
    carries its own policy; the browser reports no violation; and a violation the test provokes
    reaches the report endpoint and the log;
  - the server refuses to start with an `ORIGIN` holding credentials or a path, with no database
    URL, both database variables, or an owner role without `CREATEROLE`, without echoing a value;
  - `SIGHUP` and `SIGTERM` each shut it down with exit code 0;
  - neither the token nor the password appears in a response, a log entry or the audit trail.

## Commands

The ground floor's ([docs/SPEC.md](SPEC.md#commands)), plus `bun run --bun db:generate` (Drizzle Kit
generates a migration from the schema, then Biome formats it). `test` and `smoke` need Docker or
`COMRADARR_TEST_DATABASE_URL`, and `dev` and `preview` a PostgreSQL through
`COMRADARR_DATABASE_URL`; the README shows one `docker run` line for each.

## Boundaries

- **Always:** startup finishes before the first request; reviewed, forward-only migrations; named
  database operations and short transactions (D6); parameterised queries; redaction before writing;
  the token only in memory and on the console; the cheap checks before the hash; refusals in
  `handle` returned, never thrown; (comradarr) every claim attempt audited, the grant in the claim's
  transaction.
- **Ask first:** another database engine or driver; a logging library; a second owner or any role
  (D20); a change to the shared HKDF labels once a role uses them; any CI change.
- **Never:** a token or password in a log entry, response, the audit trail or the database (only the
  hash); a role password sent as text; SQL built from strings outside `db/roles.ts`; a stored
  address; a way to skip a first-run step; a claim after first run; `includeSubDomains`;
  (comradarr) `unsafe-inline` outside `style-src-attr`, `unsafe-eval`, or `report-to`.

## Docs this module changes when built

- **`docs/SPEC.md`:** the status line and row 3 (built); the tech-stack table (Drizzle); the
  `db:generate`, `test` and `smoke` command rows; the testing section; "Open decisions": the `setup`
  line goes; ground-floor choices 3 and 5 close.
- **`docs/decisions.md`:** D15 moves to Decided with the validated pair; D16 with the privilege
  matrix and its tests; D17 gains the oldest PostgreSQL version and the role names; D14's logging
  half moves to Decided as the app's own logger and why, and D14 keeps only the job half; D18 loses
  the PostgreSQL backup and restore, which the validation closes.
- **README:** the variables above, the database and its roles, the Compose example with PostgreSQL
  and `stop_grace_period`, `ORIGIN` and the proxy fix, first run (the banner), and backups.
- **AGENTS.md:** the status and the structure tree.

## Success criteria

1. The tests above pass, with `check`, `lint`, `build`, `smoke` and prek, and CI's `checks`,
   `smoke` and `ci-ok` pass.
2. A fresh built server with the Compose example's PostgreSQL prints the banner, sends every page to
   `/setup`, and is claimed once over plain HTTP through the banner's link; then the placeholder `/`
   serves as before, with the headers and CSP, and `/healthz` reports the database healthy.
3. The validation above has passed, with its evidence in the build PRs' bodies.
4. The docs listed above say what was built.
