# Spec: `setup`

**Status:** built (2026-11-16), module 3 of the capability map ([docs/SPEC.md](SPEC.md)), in PRs
#224–#235. It closed D15, D16, the oldest PostgreSQL version (D17), D14's logging half (D12), the
CSP's inline-style question, ground-floor choices 3 and 5, and the minimum length and
common-password parts of `sign-in`'s password rules. `setup` is shared (D20) and obzorarr is its
reference ([Shared groundwork](../AGENTS.md#shared-groundwork)): this port started from obzorarr's
spec before its cut (`0fb3565:docs/SPEC-setup.md`) and its code and tests at `b59b909`, which
include the follow-ups #337–#342. This file keeps what the code and tests can't say. The full text
before this cut is `33fcfc2:docs/SPEC-setup.md`.

**What differs from obzorarr:**
- **The database** is PostgreSQL through Drizzle and Bun SQL (D5), not embedded Turso: one owner
  URL, from which startup creates the app and audit-admin roles of D7 with passwords derived from
  the master key (D17), a pre-flight check, the role privileges and their tests (D16), and Drizzle's
  newest stable pair, since D25 allows no release candidate (D15).
- **comradarr's additions in row 3:** the audit trail, the health check with per-component status,
  the error format, the CSP report endpoint, the request id and one log line per request,
  unexpected errors through the logger, and the check that rejects SQL built from strings.
- **A stricter policy:** style elements need the nonce, and only style attributes are allowed
  inline (`style-src-attr 'unsafe-inline'`), where obzorarr allows every inline style; plus the
  extra headers comradarr's notes add.
- **The token's banner** on the console, with a link that carries the token in its fragment, and
  **the claim**, which shows which password rules a password already meets and audits every
  attempt.
- **Moved here from `sign-in`, as obzorarr did:** `ORIGIN`, the cross-origin check and the password
  rules. **Moved to `sign-in`:** the claim's per-address limit, with every other rate limit
  ([Before `sign-in`](#before-sign-in)). Both changed the capability map's rows 3 and 4.
- **Changes to comradarr's approved notes,** which the owner approved with this spec (2026-11-16,
  PR #222); the sections below say why: the CSP allows inline style attributes; strict transport
  security never covers subdomains; there is no console log format and no CSP report-only switch;
  the token's link is a full address only when `ORIGIN` is set, and the token can still reach the
  browser's history; the password's strength shows as the rules it meets, not as a score.
- The app name, the `COMRADARR_` prefix, the claim page (its brief is comradarr's), and the decision
  numbers: comradarr's D12 is obzorarr's D11 (logs), D19 its D17 (one process), D24 its D26 (the
  master key) and D25 its D27 (dependencies).

**Reading the marks.** A bullet or clause marked "(comradarr)" is this app's own; the rest is the
shared wording, from obzorarr's spec. A "(comradarr)" mark inside a bullet covers the rest of that
bullet, and "(comradarr: …)" only its own parentheses. A section headed "(comradarr)" is
comradarr's own throughout.

## Objective

A fresh install starts safely and is claimed by its one owner (D20): the configuration is checked
and the database reached, checked, migrated and its roles set before any request is served, and
shutdown stops work, drains and closes cleanly; entries are logged as redacted JSON (D12); every
state-changing request passes the cross-origin check, and every response the app renders carries
the security headers and a nonce-based CSP; and until the claim, every page sends the visitor to
`/setup`, where the bootstrap token printed to the console creates the owner account. (comradarr)
Every claim attempt is audited, and `/healthz` reports the overall and per-component status.

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

**The database URL** (comradarr) is a secret, so it follows the master key's rules (D24): one of
`COMRADARR_DATABASE_URL` and its `_FILE` form, never both. Its role is the owner role
([Roles](#roles)). Missing, it stops startup (D17).

**What the environment holds** (comradarr): only what must exist before the start. The master key,
the database URL, `ORIGIN`, `COMRADARR_LOG_DEBUG`, `HOST` and `PORT` and adapter-bun's other
variables (below), and later `sign-in`'s recovery switch (D20). Every other setting is stored in
PostgreSQL, changed in the app, audited and in effect at once, and a network setting is tested
before it is saved (`http-boundary`). There are no configuration files. Plain settings and secrets
are stored apart: a secret is encrypted in its own field (`secrets`), so reading plain settings
never decrypts anything.

Two things comradarr's notes asked for are left out (comradarr):
- **A console log format for development:** the JSON lines read fine in a terminal and pipe to
  `jq`, and one format is one thing to test.
- **A report-only switch for the CSP:** its reason was development, and SvelteKit's dev server
  already relaxes the style policy for Vite's injected styles. The built server always enforces it.

**adapter-bun's own variables** (`SHUTDOWN_TIMEOUT`, `CONNECTION_IDLE_TIMEOUT`, `BODY_SIZE_LIMIT`)
are read and checked by the adapter, with its own defaults and messages, which may echo a malformed
value; the app adds no code for them, and the README lists them. The container's stop timeout must
exceed `SHUTDOWN_TIMEOUT` plus the app's 5-second cleanup, so the README's Compose example sets
`stop_grace_period` (Docker's default is 10 seconds). The adapter already exempts event streams
from `CONNECTION_IDLE_TIMEOUT`. (comradarr: the app takes no uploads, so `BODY_SIZE_LIMIT` needs no
change.)

**`ORIGIN`** is optional and never required. It is plain `ORIGIN`, not an app-prefixed name: an app
prefix would mean setting adapter-bun's `envPrefix`, which would then reject the master key's
variable. It is checked twice:
- **adapter-bun** reads it when the server module loads, before `init`, and uses it to correct
  SvelteKit's `event.url`. An empty or unparseable value stops it with the adapter's own message,
  which includes the value, so a container image's entrypoint unsets an empty `ORIGIN` and its
  templates leave it out (the image's work; comradarr has no image yet).
- **The app** then refuses what the adapter accepts and quietly trims: a path, query, fragment or
  credentials. An empty `ORIGIN` is refused too, since the adapter refuses it first.

The cross-origin check, the strict-transport decision, the token's link and `sign-in`'s browser's
address all use the one value `config/origin.ts` gives.

## Startup and shutdown

**Startup** runs once, in SvelteKit's `init` hook, before any request is served, and is skipped
while building: the master key, which also derives the role passwords; the configuration; the
database (comradarr: as the owner role, the pre-flight check, the migrations, the roles and their
privileges, and the check that the database knows every audit action; then the owner connection
closes and the app role's pool opens); each module's startup work, in a fixed order (`setup`'s:
load first run's state and, while unclaimed, print the bootstrap token); then the jobs. A job that
fails to start is logged, not fatal. A failure before the jobs is logged and thrown from `init`:
the built server exits non-zero before it listens, and the dev server stays up with every request
failing. What later modules' jobs keep is in SPEC.md
([Capability map](SPEC.md#capability-map), "Every module's audit entries, logs and jobs").

(comradarr) **Waiting for PostgreSQL.** Containers start together, and PostgreSQL may not accept
connections yet. So startup keeps trying for 30 seconds while the failure is one waiting can fix (a
refused or unreachable connection, a Compose service's host name that doesn't resolve yet, or
PostgreSQL still starting up), and fails at once on anything else, such as a refused password. The
README's Compose example also waits for PostgreSQL's health check, so this wait is only a backup.

**Shutdown.** adapter-bun drains open requests for `SHUTDOWN_TIMEOUT`, exits at once on a second
signal, and emits `sveltekit:shutdown` without waiting for its listeners. So the app stops the jobs
and timers (the token's included) and closes open streams on the signal, so browsers reconnect,
while the adapter drains; on `sveltekit:shutdown` it waits for those jobs, closes outbound
connections and the database pool, flushes the logs, so a closing error is written, and exits 0;
and it exits non-zero anyway 5 seconds after `sveltekit:shutdown`, even with an upstream call still
outstanding. `SIGHUP` counts as a stop. `dev` gets no handlers, because Vite never emits
`sveltekit:shutdown` and a `SIGINT` listener would stop Ctrl+C from ending it.

## The database

(comradarr) The whole section is comradarr's own; obzorarr's is one embedded file. D5, D6, D7,
D15, D16 and D17 hold the engine, the access rules, the roles, the validated Drizzle pair, the
privilege matrix and the deployment.

### Versions

The Drizzle pair is D15's. If an update fails its tests, the build stops and asks: another driver
is a new dependency. PostgreSQL is 16 or later (D17 says why); the pre-flight check refuses an older
server, naming the version it found and the one it needs. The tests and the Compose example use the
newest release (18 today), and the role and privilege tests also run on 16.

### Roles

D17 holds the design and its reasons: the owner role from the URL, used only at startup; the app
and audit-admin roles named after the database (`<database>_app`, `<database>_audit_admin`), so a
second comradarr on the same server can't reset the first one's passwords; their passwords derived
from the master key, so there is nothing more to store; and each role logging in on its own
connection, never through `SET ROLE`, which an injected statement could switch back. Beyond it:
- **Startup sets both passwords every time,** with no expiry and no connection limit, and creates a
  missing role, so a restored database, a leftover role or a new master key needs nothing by hand.
- **A password is sent as a SCRAM-SHA-256 verifier** computed in the app, never as text, so a server
  that logs its statements never logs a password (what `psql`'s `\password` does). comradarr never
  logs a verifier either; the server's statement log shows the one sent, by design.
- **The privileges** come from one matrix, set after every migration (D16), so a table a later
  migration adds gets the app role's privileges without a new rule. Before granting, startup
  revokes what an older or upgraded database, or an earlier grant, may have given; after granting,
  it reads the roles' effective privileges back and refuses to serve on one the matrix doesn't
  give, such as a grant another table owner made.
- **At runtime** the app role's pool is built from the owner URL with the user and password
  replaced, so host, port and TLS parameters carry over.
- A server whose `pg_hba.conf` doesn't let the new roles in fails with an error naming the role,
  and the README says what to allow.

### Access and migrations

**Access** follows D6: each aggregate's file in `db/` holds its tables and its named operations;
services own the transactions.

**Parameterised queries only.** Every query is parameterised, and `db/parameterised.test.ts` fails
on SQL built from strings anywhere in `src/`. Its two exceptions are `db/roles.ts`, whose role
statements can't take parameters, so every identifier passes through one quoting function and every
literal is a verifier the app computed, and `db/migrate.ts`, which runs the reviewed migrations. It
is a test, not a Biome rule, because a rule would change the shared `biome.json`.

**Migrations** are generated by Drizzle Kit (`db:generate`), reviewed and committed in `drizzle/`,
and applied at startup from the built server's own bundle (D15). They only go forward: going back
means restoring the backup taken before the upgrade and running the previous version, never running
an older version on a migrated database (the README's "Backups"). `services/audit/actions.ts` holds
the rule for adding an audit code in a migration.

### Tables

- **`settings`:** one text value per key. `setup` stores first run's step pointer here; later
  modules add their own keys.
- **`owner`:** one row at most, enforced by the schema. `two-factor` and `oidc-sign-in` add their
  fields.
- **`audit_log`** (comradarr): [The audit trail](#the-audit-trail).

## The audit trail

(comradarr) One service, `services/audit/record.ts`, writes every entry, from the first claim
attempt on, and the app role can only add and read entries (D7, D16). The action codes are one
documented list that only grows, the `audit_action` enum, each with a context of a fixed shape in
`services/audit/actions.ts`, passed through the log redaction so no secret reaches it. An entry
also records who acted (the owner; nobody, when the client address is who acted; or the app itself)
and the request's client address, user agent and id; the id links the entry to the request's log
lines.

The entries of a granted claim are written in the claim's own transaction, so a claim never
completes unaudited. Any other entry is written on its own; if that write fails, the failure is
logged as an error and the request answers as it would have. What later modules record, and what
goes to the log instead, is in SPEC.md ([Capability map](SPEC.md#capability-map), "Every module's
audit entries, logs and jobs") and each module's notes.

**An accepted risk:** until `sign-in` brings the claim's limit, and after it too, since a refused
attempt is still audited, anyone who can reach an unclaimed instance can add audit entries. The
window closes at the claim, after which the claim answers "not found" and records nothing.

## Logging

D12 holds the decision and why the app has its own logger. Four levels, debug dropped unless
`COMRADARR_LOG_DEBUG` is on. Each entry is one JSON line on standard output with a level, a
message, a source, structured metadata and a millisecond timestamp.

**Redaction** runs before an entry is written:
- credentials in URLs, and token-like query parameters, also inside a parameter's value once
  percent-decoded; such a value is redacted whole;
- token, authorisation and cookie fields in payloads and headers;
- at any depth, any metadata key that looks like a token, secret, password, cookie, session or key,
  except the names `redact.ts` lists as holding no credential, whose values are still cleaned like
  any other (comradarr: the list starts empty; the first module that logs such a name adds it, and
  only a name comradarr logs);
- a `Secret` (`secrets`) is already `[redacted]`;
- (comradarr) secret-shaped values wherever they appear: argon2 password hashes, three-part tokens
  and stored ciphertexts; the API-key header and the API-key prefix pattern join when `api-keys`
  defines them.

(comradarr) **Each request** gets an id when it arrives, kept for the request like the language, so
every entry written while handling it carries it without being passed it, and one `info` line
records the request when its response is ready. `/healthz` is logged at debug, since probes would
drown the log. Responses produced before `handle` (the built files) aren't logged.

(comradarr) **Unexpected errors** reach SvelteKit's `handleError`, which logs them through the
logger with the request id and answers `internal_error` with that id. Without it, SvelteKit prints
them with `console.error`, unredacted and not as JSON. An error is logged as its name, message,
cause and stack, all cleaned, never its local variables.

Console output meant for whoever runs the server, such as the bootstrap token's banner, is never a
log entry. It still reaches the container's output, which is why the console is trusted (below).

## The request checks

`handle` runs its stages in this order (comradarr: after the request id's): the language
(`i18n`), the security headers, the cross-origin check, then the setup gate. `sign-in` later adds
its stages between the cross-origin check and the gate, and `http-boundary` resolves the client
address after the language (SPEC.md's `sign-in` notes, "Request order"). Every refusal is returned,
never thrown ([SPEC-i18n.md](SPEC-i18n.md#choosing-the-language)), so it keeps the language and the
headers.

### The cross-origin check

SvelteKit's own form check compares the browser's `Origin` with `event.url`, which adapter-bun
builds as `https` unless `ORIGIN` or a protocol header says otherwise, so it would refuse the claim
over plain HTTP. So that check is off, remote functions stay off (they would need `ORIGIN` too), and
the app's own check replaces it. It asks the browser, through `Sec-Fetch-Site` and `Origin` (the
rules and their order are in `cross-origin.ts` and its test matrix), so the app needs no address of
its own and stores none. (comradarr: it replaces the legacy app's origin check against a stored
list and its exemptions; the claim and the CSP report endpoint are checked like any other POST.)

What later modules must keep:
- **Requests from no browser,** with neither `Origin` nor `Sec-Fetch-Site`, pass only on an explicit
  list of machine routes, each with the credentials the app's approved docs require (comradarr:
  the JSON API with a valid API key, which `api-keys` adds; until then the list is empty, so every
  such request is refused). The session cookie is never honoured on one: such a request carrying
  only a session cookie gets a 403.
- **The refusal** is a 403 with the app's own "Access denied" page, or (comradarr: the error
  format's `access_denied`) for JSON callers, with the security headers and in the viewer's
  language; `sign-in`'s error pages reuse its messages.

**When `ORIGIN` or a proxy fix is still needed:** behind a proxy that rewrites `Host`, over plain
HTTP for every browser, and over HTTPS only for browsers without `Sec-Fetch-Site` (Safari before
16.4, Firefox before 90, Chrome before 76). The README gives the fix.

**Accepted residual risks.** Over plain HTTP, the `Origin` and `Host` comparison can't tell `http`
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

On every response that passes through `handle`, early returns and error pages included; (comradarr)
no setting turns them off or changes them. The choices the code can't explain:
- **`Referrer-Policy: same-origin`,** never `no-referrer`, which makes browsers send `Origin: null`
  on the app's own form posts.
- (comradarr) **`Permissions-Policy`** denies every powerful feature the app doesn't use, but
  writing to the clipboard stays allowed for the copy buttons later modules add.
- **Strict transport** only over HTTPS, known when `ORIGIN` is `https`, or, when `ORIGIN` is unset,
  from `Sec-Fetch-Site` sent to a host that isn't `localhost`, `*.localhost` or loopback, since
  browsers send it only to HTTPS and those hosts. Never `includeSubDomains`: other apps may share
  the domain (comradarr: this reverses the notes, which asked for it; Sonarr or Radarr on a
  subdomain over plain HTTP would become unreachable from that browser for a year). Never
  `preload`, which is the operator's decision. An accepted risk: HSTS covers every port of the host
  name, so another app on the same host over plain HTTP becomes unreachable from that browser until
  it moves to HTTPS.

### The content security policy

On every page, through SvelteKit's `csp` option in `vite.config.ts`, in nonce mode. No page is
prerendered (`i18n` already forbids it), so every page gets its own nonce. (comradarr) Never
`unsafe-inline` in `script-src`, `style-src` or `style-src-elem`, never `unsafe-eval`, and never
`upgrade-insecure-requests`, which would break a plain-HTTP install at home. A dependency that needs
any of them is refused.

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
sets its dark colour scheme with `<meta name="color-scheme">`, not a style.

**A limit:** responses produced before `handle` carry none of these headers: the built files
(scripts, styles, fonts, `static/`), which adapter-bun serves itself, and the adapter's own 400 and
413 answers. None is a document, so framing and the CSP don't apply to them, and Bun sends each file
with its real content type.

### The CSP report endpoint

(comradarr) `POST /api/csp-report` needs no session and works before setup (the gate lets it
through). The policy names it with `report-uri` alone: the probe showed that Chromium, once a policy
also has `report-to`, ignores `report-uri` and, over plain HTTP, sends nothing at all. A browser's
report passes the cross-origin check like any POST. Each violation is logged at warning with
bounded context, and everything that passes the cross-origin check gets a 204, accepted or not, so
a prober learns nothing. `sign-in` adds its per-address limit.

### The error format

(comradarr) Every error the app answers in JSON has one shape, in `lib/shared/errors/problem.ts`,
so pages and later clients read one thing. Its `type` is a stable id and also its message key, so
its title and detail are translated into the viewer's language. `fields` holds per-field errors
for a validation failure, and `context` the domain's context; `connectors` adds `retryable` for a
connector error. `sign-in`'s error pages show the same messages.

## Health

(comradarr) `GET` and `HEAD /healthz` replaced the fixed `ok` (ground-floor choice 5). No session
is needed, the gate lets it through, and it is never cached. The answer is minimal, with no
versions, timings or errors (D23). The overall status is the worst component's: `healthy` and
`degraded` answer 200, and `unavailable` answers 503, since the database, `setup`'s one component,
is critical. Later modules add theirs (connectors, indexers), and say which are critical. `sign-in`
adds its per-address limit.

## First run

**The setup gate** is the last `setup` stage in `handle`. Until first run is complete, every request
except the current first-run step, `/healthz`, (comradarr: the CSP report endpoint) and the
responses produced before `handle` gets a 303 to that step (owner sign-in with its two-factor
challenge, recovery and first run's own helpers join the exceptions when their modules add them;
the OpenAPI document never does). (comradarr) A JSON caller, one that asks for JSON and not for a
page, gets a 503 `setup_incomplete` instead, never a 401. The gate reads first run's state from
memory, which startup loads and the claim updates (one process, D19).

**The step pointer.** The server keeps one current-step pointer in `settings`. The browser can't
skip ahead: each step's action checks that it is the current step, a step that offers Previous only
moves the pointer back, and only the last step's action completes first run. Every step after the
claim needs the owner's session, which `sign-in` brings. (comradarr) The pointer is stored and
compared exactly: any change to setup state, creating the owner included, writes it, so an
interrupted first run is still gated after a restart, and nothing is inferred from an owner account
existing. Until Verify access passes, every signed-in page goes back to it (`http-boundary`, D20).

### The bootstrap token

D20's token: 12 random lowercase letters and digits, held only in memory, never in a log entry, the
database, the audit trail or a response; printed to standard output while the instance is
unclaimed, valid for 15 minutes, after which a new one is printed, and none once the instance is
claimed. (comradarr) Each is printed as a short banner of plain lines, not a log entry, with a
warning not to paste it into chats or issue trackers, and every printing is audited.

(comradarr) **The link** carries the token in its fragment, `/setup#token=…`, which browsers never
send to the server, a proxy's access log or a referrer. It is a full address only when `ORIGIN` is
set; otherwise the banner prints the path and says to open it at the address Comradarr is reached
at, as obzorarr does. The notes asked for `localhost` in place of an all-interfaces address, but in
a container the address and port the server listens on are rarely the browser's, and a wrong link
misleads more than a path. The page fills the token in from the fragment and removes it from the
address bar at once; without JavaScript the person types it. The notes asked that the token never
reach the browser's history, which no page can promise: the visit is recorded before the page runs.
It is single-use and lasts 15 minutes.

### The claim

`/setup`, the first step, a POST form action. It checks the fields, then checks and uses up the
token with no `await` between the two, then hashes the password, then, in one transaction, creates
the owner, moves the step pointer and (comradarr) writes the granted claim's audit entries. The
cheap checks come first so a wrong guess never costs the server a hash, and a field error leaves the
token unused. A wrong or expired token gets one error (comradarr: the audit entry tells the two
apart). If anything after the token is used up fails while the instance is still unclaimed, a new
token is printed, unless shutdown has begun. The claim stores no address of its own (the browser's
address), and nothing but the owner row, the pointer and (comradarr) the audit entries.
(comradarr) Every attempt is audited, and setup's endpoints never log request bodies.

**After it,** the claim no longer exists: `/setup` answers "not found" once first run is complete
(D20), and the claim action answers it whenever the instance is claimed.

**Owner credentials,** in `security/password.ts`, which `sign-in`'s password change and recovery
reuse:
- **The username** is stored with its case kept, and compared after `toLowerCase()`, so case doesn't
  matter.
- **The password** needs 15 characters because that is NIST SP 800-63B-4's minimum for a password
  that is the only factor, which it is until two-factor is turned on. NIST also requires a
  blocklist, and length alone accepts the long passwords such lists hold, so the bundled list of
  common passwords, copied from obzorarr, is checked too; `password.ts` names its source and how to
  rebuild it. There are no composition rules.
- **The hash** is argon2id with its parameters fixed in the code, never a setting, and stored in
  each hash (comradarr's notes). It is of the NFC form, so `sign-in` verifies what was hashed. The
  password is never logged or returned.
- **The form** has one password field with a control that shows what was typed, and no
  confirmation field.
- (comradarr) **How strong it is** shows as the rules a password meets, not as a score, updated as
  the person types. The rules the browser can check live in `lib/shared/password-rules.ts`, which
  `password.ts` uses too, so the page never shows a password as meeting the rules that the server
  refuses for one of them. The common-password list stays on the server. No strength estimator: it
  would be a dependency, and its score would disagree with the rules.

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
