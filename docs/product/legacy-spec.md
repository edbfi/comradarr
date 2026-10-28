# Comradarr — Product and Behaviour Specification for a Rewrite

> [!NOTE]
> **Legacy product specification**, imported from the pre-rewrite documentation. It describes the
> designed app's behaviour, which the rewrite keeps unless an approved spec or decision changes it.
> Its technology and deployment content is superseded by [`docs/decisions.md`](../decisions.md):
> §0 and the build column of §17.2 (status of the old code), "One container, one setting" in §2.2 and
> "one setting to start" in §16, §15.2 (deployment shape), and the bundled relational store wherever it appears (§1.2, §11.5,
> §15.1, §15.4). The database is a separate PostgreSQL service whose roles the app creates, with
> passwords derived from the master key, and whose backup is PostgreSQL's own (D17, superseding the
> generated and audit-admin credentials of §11.5 and §15.1). The roles, permissions and provisioned
> users of §3, §10.3 and §10.4, header sign-in, several OIDC providers, turning password sign-in off
> (§10.1), the setup-claim cookie and token file (§9.1) and the wizard order of §9.4 are superseded
> by D20, the English-only first release (§14.7) by D21, the four-part encrypted layout (§11.2) and
> the master key's file precedence, versions, rotation and denylist (§11.3) by D24, and the
> configuration snapshots of §12 are left out (owner decision). D23 makes the version step of §7.3
> a warning and drops Sonarr v3 (§7.3, §13): each upstream is supported at its latest stable release
> only. Sections are deleted as approved `docs/SPEC-<id>.md` files cover them, and the file goes
> once nothing is left (AGENTS.md, cleanup procedures).

## 0. Status: read this first

Comradarr is **not a shipped application**. The main branch of the repository is planning-only: it contains a long product requirements document, an implementation plan, agent rule files, a licence and an icon. There is no runnable backend, no frontend, no container image and no deployment on main.

A feature branch holds a **partial implementation** of the backend. What exists there, as verified by its own test suite, is roughly the first four of twenty-five planned phases:

| Area | State on the feature branch |
|---|---|
| Application skeleton: settings loading, structured logging with secret redaction, standard error envelope, health endpoint, correlation IDs | Built and tested |
| Persistence schema for every entity in this document, forward-only migrations, three-role database privilege separation with the append-only audit log carve-out | Built and tested (migrations run in parallel from several processes without racing) |
| Field-level encryption with key versioning and row-bound authentication, master-key strength validation, the secret wrapper type, the audit writer and retention sweep | Built and tested |
| Authentication: local password login, trusted-header provider, OIDC provider, sessions, API keys with scopes, persistent rate limiting, permission check | Built and unit-tested, but **only partially wired into the request path** (see section 10.6); several pieces exist as code that nothing calls |
| Connectors to Sonarr/Radarr/Prowlarr, sync engine, rotation engine, budgets, event bus and live updates, notifications, setup wizard, HTTP boundary hardening, page-oriented API, every screen of the UI, internationalisation, metrics, import/export, the single-container packaging | **Designed only** — described in the PRD and plan, no code |
| Frontend | A framework starter page with a placeholder test; the visual theme tokens are vendored but unused |

The repository's own status notes lag the code: its readme still describes the foundations phase as active, its changelog describes only the skeleton phase, and the readme's one-line description claims support for a third media manager (an adult-content fork of Sonarr) that appears nowhere else in the design or code. Treat Sonarr, Radarr and (optionally) Prowlarr as the supported integration set.

Throughout this document each major section carries a status marker: **Designed**, **Built**, or **Partially built**. Everything marked Designed was thought through in detail but has never been validated against a real library, real indexers or real users. Numbers given as defaults in Designed sections are the designers' intent, not measured values.

---

## 1. Purpose

### 1.1 The problem

Sonarr and Radarr manage television and film libraries well, but their searching is one-shot: once an item is downloaded (or once an automatic search fails) they stop looking. Finding better releases for a large library means manually triggering searches, which is impractical at the scale of tens of thousands of movies or hundreds of thousands of episodes. Files also go missing — disk failures, corruption, accidental deletion — and neither application notices until a rescan.

Comradarr treats the entire library as a **perpetual search rotation**. Every item the connected Sonarr and Radarr instances know about — every episode, every movie, whether or not a file exists — is cycled through a search command indefinitely. Items with no file are prioritised; items with files are still searched for upgrades. The system never reaches "done".

The hard engineering constraint is indexer budget. Indexers typically allow somewhere between fifty and a thousand queries per day. With half a million items and that budget, Comradarr must (a) cover as many items as possible per search command, (b) spread the budget evenly through the day, and (c) never exceed the limit of any indexer in the chain, because the consequence is a temporary or permanent ban.

### 1.2 Who it is for

Self-hosting home-lab operators who already run a media stack (Sonarr, Radarr, usually Prowlarr, a download client, a media server). The typical deployment is one person, one instance, one account, on their own hardware, often behind a reverse proxy, often on plain HTTP inside a LAN. The design repeatedly refers to "the 98% case": one container, one environment setting, zero database configuration, and a setup wizard that explains networking so the operator does not need to know it in advance.

### 1.3 Where it sits in the stack

Comradarr sits **beside** Sonarr and Radarr, never between them and anything. It reads their libraries and sends them search commands; they do the actual indexer querying and downloading. If Prowlarr is present, Comradarr reads indexer limits, usage and health from it purely as information — it never talks to an indexer itself. It needs outbound reachability to those instances and, optionally, to an identity provider and notification destinations; it needs inbound reachability only from the operator's browser (or proxy).

### 1.4 What it deliberately does not do

- It does not download, import, rename, or manage files. It is not a media manager.
- It does not query indexers directly and does not manage indexer configuration. It never lets the operator set indexer-level query limits (that is Prowlarr's job and misconfiguring it causes bans).
- It does not inspect or manipulate the Sonarr/Radarr download queue.
- It does not store overview text, artwork, genres or ratings — only the fields needed to rotate and display.
- It does not phone home. No analytics, no crash reporting, no feature-usage telemetry of any kind.
- It does not provide in-application password reset by email, hard account lockout, or durable notification delivery queues.
- It is a single-instance application: one installation manages all connected instances; there is no multi-tenancy and no clustering.

---

## 2. Product feel and goals

### 2.1 The one-sentence feel

Calm, patient observation — not aggressive scanning. The design names its visual direction "Watching the Sky": the product is waiting for better releases to surface, indefinitely, and the interface should feel *lit* rather than *urgent*. This is a deliberate rejection of the "radar scope" metaphor the name suggests (phosphor green, industrial gauges). Instead: deep arctic-blue backgrounds, an aurora-green operational colour, a violet-blue informational accent.

### 2.2 Opinionated choices and why

**Rotation, not a queue.** There is no work queue with items entering and exiting, no "exhausted" state, no backoff timers, no retry state machine. Every item is always present and is simply sorted by staleness. The only per-item state is a timestamp and a counter. This is chosen because it has no stuck-item edge cases, trivially survives crashes (restart resumes from timestamps), and is easy for an operator to reason about. The plan explicitly forbids the word "queue" in the rotation subsystem and forbids any operator-visible "queue depth".

**Coverage per command is the core optimisation.** A season search costs one indexer query but covers every episode in the season. The planner's job is to spend each indexer query on as many items as possible, and when it does, every covered item — not just the ones that were due — is pushed to the back of the rotation.

**Safety first on budgets.** Without Prowlarr, conservative defaults. With Prowlarr, the effective budget is the *most restrictive* indexer minus a 20% safety margin for traffic Comradarr does not control. The operator can tune how aggressively Comradarr operates but can never set indexer limits.

**One container, one setting.** The production artefact bundles the application, the built UI and a relational store in a single image. The operator sets one secret (the master encryption key), mounts one volume, and starts it. An external database is an override, not a requirement.

**Test-driven configuration.** Every networking setting (proxy trust, public origin, allowed origins and hosts) is proposed by the system from what it observes, explained in plain language, and then *proven to work end-to-end against the operator's own browser* before it is persisted. The operator cannot lock themselves out with a bad paste; a failed test leaves the previous value active. This pattern is applied both in the setup wizard and in post-setup settings, and the same four-state visual affordance (observed → proposed → testing → committed/rejected) is reused everywhere.

**Ownership proven by log access.** First-run setup is claimed with a short-lived token printed to the process log. No default password, no admin password in the environment, no "first browser wins".

**Never show a secret after storage.** Connector API keys and Comradarr's own API keys are masked forever after entry (last four characters only). A forgotten key is replaced, not revealed.

**Security defences are structural, not procedural.** Append-only audit logging is enforced by database privileges, not application checks. Secrets are a wrapper type that renders as a redaction marker everywhere and can only be opened at explicitly auditable call sites. Outbound URLs are re-resolved and re-classified on every request. Redirects from connected instances are never followed.

**Simplicity over durability where the audience allows it.** No message broker, no cache server, no separate worker process, no dead-letter queue for notifications, no down-migrations, no built-in backup command. Each of these is justified by the single-operator home-lab audience and the fact that all meaningful state is reconstructible.

**Live but not noisy.** The dashboard updates in real time from a server-pushed event stream, but numerals swap atomically (no count-up animation), cards announce a change with a single brief tint pulse, and the only persistent motion is a slow heartbeat beside the wordmark that pulses while the rotation engine is dispatching and goes still when it is idle. Every motion collapses to an instant state change under the user's reduced-motion preference.

**Dense where it must be, calm where it can be.** The content browser (up to 500,000 rows) is tight: compressed rows, monospaced numerals, no decoration. The dashboard breathes: generous card gaps, subtle aurora gradient washes in hero areas (never behind tables or forms). Settings and the wizard are structured: paired labels and fields close together, clear separation between groups.

**Tone of copy.** Error messages say what went wrong and what to do, and never blame the user. Example standard from the design: "Connector 'sonarr-main' returned 401 Unauthorized; the API key stored in Comradarr is likely rotated or invalid. Re-enter the API key from Sonarr's settings page to resolve." Security-critical confirmations are typed, not clicked — e.g. to trust a proxy address for header authentication the operator must type the exact address being added.

**Accessibility and internationalisation from day one.** WCAG 2.2 AA is the baseline; a violation that ships is a regression. Every user-facing string passes through a translation layer even though only English ships initially.

---

## 3. Users, roles and permissions

**Status: Designed; role/permission tables Built but unseeded.**

- **v1 has one role: admin.** Every user is an admin with every permission. The 98% deployment has a single account.
- The permission *machinery* is nonetheless present from day one so that adding roles later is a data change, not an endpoint audit. Permissions are named and grouped by domain: connectors (add, edit, delete, pause), content (view, trigger manual search, pause items), sync (view status, trigger), settings (view/edit HTTP boundary, view/edit identity providers, view other security settings), audit log (view, export), API keys (create own, revoke own, view all, revoke any), users (view, invite, edit roles, delete). Every endpoint declares the permission it needs; the check runs on every request and returns "forbidden" with the required permission named, so the UI can explain it.
- **Planned post-v1 roles:** *Operator* (view everything, trigger searches and syncs, pause items, read the audit log; cannot change network/identity configuration, manage users, or touch others' API keys) and *Viewer* (read-only; cannot trigger anything that sends traffic to a connector). Role assignment for externally provisioned users may eventually be driven by a claim from the proxy or identity provider.
- **API keys inherit, and can narrow, their creator's permissions.** A key may be scoped to a subset at creation (advanced, collapsed by default). Scope is evaluated on every request as the intersection of the key's scope and the owner's *current* role, so demoting a user automatically shrinks every key they created. A key can never exceed its creator.
- **Provisioned users.** Users created by the trusted-header or OIDC providers are admins in the design (with a post-v1 setting to change the default). *The implementation provisions them as viewers and seeds no role permissions at all — a divergence the rewrite must settle; see section 13.*
- Authorization failure (403, "you do not have permission") is deliberately distinct from authentication failure (401, redirect to login), because the UX differs.

---

## 4. Domain model

**Status: schema Built for every entity below; behaviour around most of them Designed only.**

### 4.1 Overview of entities

| Entity | Kind | Purpose |
|---|---|---|
| Connector | Operational | A configured Sonarr, Radarr or Prowlarr instance: name, type, URL, encrypted API key, per-connector limits, TLS overrides, paused flag |
| Mirror series / episodes / movies | Mirror | Local copy of what the connected instances know; overwritten by sync |
| Schedule item | Operational | One row per searchable item: tier, last-searched time, search count, paused flag |
| Planned command | Operational | A dispatched search command and its lifecycle, including the set of schedule items it covers |
| Priority search | Operational | An operator-requested "search now" that bypasses rotation |
| Sync state | Operational | Per-connector sync timestamps, fingerprint, status, last error, metrics |
| Budget | Transient | Computed per connector per tick; not persisted |
| User, Session, API key, API key scope, Role permission, Rate-limit counter | Auth | Identity and access |
| OIDC provider | Auth | Identity-provider configuration (design: database; implementation: environment) |
| Application config / application secrets | Config | Runtime key/value configuration; secrets in a separate encrypted store |
| User preference | Config | Locale, theme, timezone and similar per-user values |
| Notification channel / route / template | Notification | Destinations, which events go where, and message overrides |
| Audit entry | Audit | Append-only record of security-sensitive changes |
| Configuration snapshot | Transport | Passphrase-encrypted export of non-derivable state |

### 4.2 Connector

A connector is a configured connection to one Sonarr, Radarr or Prowlarr instance. It has a unique, operator-chosen name; a type; a URL; an API key stored encrypted and bound to the connector's own identity (so ciphertext cannot be swapped between rows); per-connector rotation limits (daily command limit, maximum concurrent in-flight commands, minimum interval between commands); two TLS overrides (skip certificate verification — displayed with a prominent warning badge — or use a custom CA bundle); an optional response-size cap override; and a paused flag. Connectors can be paused and resumed, which is audited.

Identity: unique name; a stable generated identifier used as the encryption binding. Deleting a connector cascades to its mirror rows, schedule rows, planned commands, priority searches and sync state.

Health is a derived, in-memory state per connector: **healthy → degraded → unhealthy**, driven by a consecutive-hostile-response counter (section 7.1), plus **unreachable** for transport failures. Degraded reduces dispatch rate; unhealthy stops dispatch entirely while health probes continue; recovery is automatic as successes decrement the counter.

Lifecycle: created (after the full validation pipeline passes) → active → optionally paused → deleted. Edits that change URL or key re-run the full validation pipeline; a connector can never be silently repointed to an unvalidated destination.

### 4.3 Mirror entities

Mirror tables hold a cache of external state and are *never* the source of truth. Each is keyed by (connector, upstream identifier), so the same upstream identifier can legitimately exist under two connectors (two Sonarr instances with overlapping content), and a hostile instance cannot pollute another connector's rows — isolation is structural.

- **Series**: title, external catalogue id, status (continuing / ended / upcoming / deleted), monitored flag, quality profile, path, and aggregate statistics (season count, episode count, file count, size on disk). Aggregates are *recomputed from the item lists*, never trusted from the upstream response.
- **Episode**: parent series, season number, episode number, title, has-file, monitored, air date, file identifier, size, quality. Indexed by (connector, series, season) for season-level planning.
- **Movie**: title, external catalogue id, status (announced / in cinemas / released / deleted and similar), monitored, has-file, quality profile, path, size, year.

The implementation's mirror schema is thinner than the design (it keeps a free-form metadata field instead of several of the columns above); the design's field list is what the rotation and display logic needs.

### 4.4 Schedule item and tiers

The schedule is the single most important structure. One row per searchable item, keyed by (connector, content type, upstream content id). Content types are episode and movie (the implementation also reserves "series"). Each row carries:

- **Grouping**: parent series and season number, denormalised so the planner needs no joins.
- **Rotation state**: last-searched-at (null means never searched, which sorts first) and lifetime search count.
- **Priority tier**: an integer where lower rotates faster.
- **Control**: a paused flag that removes the item from rotation without deleting it.

| Tier | Name | Rule |
|---|---|---|
| 0 | Missing | No file on disk. Always tier 0, even in an ended series — a missing episode of a finished show is still urgent. |
| 1 | Recent | Has a file and aired/released within 90 days (episodes) or 180 days (movies); most likely to receive quality upgrades. |
| 2 | Monitored | Has a file; series is continuing or movie is recent. Standard rotation. |
| 3 | Completed | Has a file; series has ended or movie is old. Slowest rotation, but still rotates. |

Invariants:
- Tier is computed by the **sync engine** from file status, dates and series status. The rotation engine only reads tiers and never writes them; tier changes are tied to library state changes, never to search outcomes.
- The rotation order is (tier ascending, last-searched ascending with never-searched first), restricted to unpaused rows. This must be an indexed, constant-time query regardless of table size (the design targets under a millisecond at 500,000 rows). The implementation encodes exactly this as a partial index.
- Sync may update tier and grouping fields but **must never reset** last-searched-at, search count or paused.
- Items removed upstream are deleted from the schedule in the same transaction as their mirror rows.

### 4.5 Planned command

A record of one search command sent to a connector: the connector, the command type (episode search, season search, series search, movie search), the serialised payload, the command identifier returned by the upstream instance, dispatch and resolution timestamps, a status (pending → dispatched → completed/resolved, failed, or timed out), and the **list of schedule items the command covers**. The covers list is essential: a season search covers every episode in that season, including ones that were not due, so that all of them move to the back of the rotation and the next tick does not re-search the same season.

### 4.6 Priority search

An operator's "search now" for a single item. Unique per (connector, content type, content id) so double-clicks cannot duplicate. Dispatched before any rotation item on the next tick, subject only to the concurrency limit, not the daily budget. After dispatch the item's last-searched-at is updated normally so it rejoins regular rotation. The design deletes consumed requests; the implementation marks them consumed with a timestamp.

### 4.7 Sync state

One row per connector: timestamps of the last full, deep-incremental and incremental syncs; the stored fingerprint; status (idle / running / failed); last error; items synced and duration. Drives the coordinator's decision of which sync mode is due.

### 4.8 Users, sessions and keys

- **User**: unique email, unique username, role, password hash (or a sentinel), provisioning provider (local / trusted-header / OIDC), optional external subject identifier, timestamps. Externally provisioned users store a **non-hashable sentinel** instead of a password hash so local login is structurally impossible for them.
- **Session**: a hash of the token (never the token), user, authenticating provider (local / trusted-header / OIDC — the implementation also allows "API key"), optional identity-provider name, created, absolute expiry, last-seen, source IP and user agent (informational only). Revocation deletes the row.
- **API key**: a hash of the random part, the visible prefix, last four characters, owner, human name, optional expiry, created, last-used. Plus zero or more scope rows naming permissions.
- **Rate-limit counter**: keyed by (scope, key) — scopes such as login-by-IP, login-by-username, bootstrap-by-IP, API-key-failures-by-IP, schema-by-IP — with counter, window start, backoff state and last failure; persisted so restarts do not reset limits.

### 4.9 Configuration stores

- **Application config** is a plaintext key/value store for runtime settings that must survive restarts but cannot be set at deploy time: the setup-completed flag, the current encryption key version, the HTTP boundary configuration, trusted-header settings, observability toggles, the notifications kill switch, the install's friendly name.
- **Application secrets** is a separate encrypted key/value store (same four-part encrypted layout) for the setup-claim proof and any other inline secrets, so reading plain configuration never passes through cipher code.
- **User preferences**: per-user (key, value) rows for locale, theme (explicit three-value light / dark / system) and timezone.

### 4.10 Notifications

- **Channel**: owner, name, kind (multi-destination relay URL, or generic webhook; email is a guided form over the relay kind in the design, a distinct kind in the implementation), enabled flag, encrypted configuration (the destination URL with its embedded tokens, or the webhook's URL/method/headers/body template), TLS overrides, last-tested-at and last-test-status (never / ok / failed).
- **Route**: (user, event type, channel) with an enabled flag and a reserved, always-null predicate for post-v1 filtering. Deleting a channel deletes its routes. Absence of a route is the off switch; there is no separate mute state.
- **Template override**: (user, event type, channel kind) → subject and body templates stored verbatim.

### 4.11 Audit entry

Timestamp, action code from a fixed append-only vocabulary, actor (user id when authenticated; otherwise the resolved source IP), a structured context payload with all secrets redacted, request IP, user agent, request correlation id, and two reserved null columns for a future hash chain. Deleting a user nulls the actor reference but keeps the row. Indexed newest-first and by (action, newest-first).

### 4.12 Identity and uniqueness summary

| Entity | Identity | Uniqueness rules |
|---|---|---|
| Connector | generated id | name unique |
| Mirror rows | (connector, upstream id) | — |
| Schedule item | (connector, content type, upstream id) | — |
| Priority search | generated id | (connector, content type, upstream id) unique |
| User | generated id | email unique; username unique; external subject unique among externally provisioned users |
| Session | token hash | token hash unique |
| API key | generated id | key hash unique |
| Route | (user, event type, channel) | — |
| Template override | (user, event type, channel kind) | — |
| Rate-limit counter | (scope, key) | — |
| Config | key | — |

---

## 5. Sync engine

**Status: Designed.**

### 5.1 Purpose

The sync engine keeps the mirror an accurate, near-real-time reflection of the connected instances. Everything else depends on it: the rotation engine can only search what the mirror knows, and can only prioritise correctly if it knows which items have files.

### 5.2 Three sync modes

| Mode | Default cadence | What it does | Cost |
|---|---|---|---|
| Incremental | every 5 minutes | One call for the series/movie list; compute a fingerprint; compare with the stored one; fetch episodes only for series/seasons whose statistics changed | 1–5 calls, under a second; catches most day-to-day changes |
| Deep incremental | every hour | Fetch all episodes/movies and diff each against its mirror row field by field; recompute tiers for every item | For Sonarr, one call per series (30–60 s for 500 series); for Radarr a single call |
| Full | every 12 hours and on first connection | Fetch everything; delete mirror rows that no longer exist upstream; upsert all; fully reconcile the schedule | The correctness safety net; the **only** mode that detects removals |

All intervals are configurable. Because a Radarr deep sync costs the same as an incremental one, Radarr connectors skip incremental and always run deep incremental.

### 5.3 Fingerprints

A compact summary computed from the list response alone: for Sonarr, per series per season — monitored, episode count, file count, total episode count, size on disk; for Radarr, per movie — monitored, has-file, size, quality profile. Fingerprints are stored per connector and structurally compared to produce a changeset (series added / removed / modified, and which seasons). The fingerprint is an optimisation, not a correctness mechanism; it can miss changes that cancel out in aggregate, which deep and full sync catch.

### 5.4 Diffing and applying

Episode- and movie-level diffs detect additions, removals and field-level modifications, and whether a modification warrants a tier change (an episode gaining a file moves from Missing to Monitored). Time-based tier drift (an episode ageing past 90 days) is caught by the deep sync's full recomputation.

The applier writes mirror changes in bulk batches, then applies schedule changes **in the same transaction** so mirror and schedule can never disagree across a sync boundary. For schedule rows it updates only tier and grouping, preserving rotation state. A post-pass applies series-level context: episodes *with files* in ended series are downgraded to Completed; missing episodes of ended series stay Missing. New schedule rows start with last-searched-at null (never searched) so they surface first within their tier.

### 5.5 Mappers and semantic validation

Between deserialisation and the database, a per-connector mapper enforces invariants the wire schema cannot: dates outside 1900–2100 are coerced to null (and logged with the value truncated) rather than allowed to corrupt tier computation; identifiers must be positive; season/episode numbers must be sane; aggregate counts are recomputed from item lists and the recomputed value always wins over the stated one.

### 5.6 Coordinator and concurrency

A background coordinator ticks every 30 seconds, checks every active connector's last-sync timestamps against the configured intervals, and runs the highest-priority overdue mode: full if overdue or never run, else deep, else incremental. Syncs are sequential per connector (never two at once against one instance) but concurrent across connectors. Within a Sonarr sync, per-series episode fetches run concurrently with a small bounded parallelism (about five) to balance speed against politeness. Failures record the error on the sync state and retry on the next tick; a transient failure never blocks later syncs. Completion and failure each publish an event with summary statistics so the UI updates live. One summarising log line is emitted per tick, not one per connector.

After setup completes, the coordinator immediately triggers full syncs for any connector never synced; the rotation engine waits for a populated schedule before starting.

---

## 6. Rotation engine, planning and budgets

**Status: Designed.**

### 6.1 The loop

A single background loop ticks every 15–30 seconds (configurable). For each active, healthy connector it: asks the budget system how many commands may be sent now; consumes any pending priority searches first; pulls that many of the stalest unpaused items in (tier, last-searched) order; hands them to the connector type's planner; dispatches the resulting commands; records them; and updates the schedule. A separate loop polls command status every 30 seconds. The loop is a no-op before setup completes, and idles when the budget is exhausted, the connector is unhealthy or paused, or there is nothing to do. It emits one summarising log event per tick and publishes dispatched/tracked/idle events.

### 6.2 Planning: maximising coverage

Sonarr offers three search granularities with wildly different cost: an episode search costs one indexer query per episode; a season search costs one query for the whole season; a series search costs one query for the whole series. The Sonarr planner groups the due items by series then season and chooses:

- **Series search** when the due items span many seasons of one series — more than half of its seasons, or at least three.
- **Season search** when two or more items fall in the same season, or more than 30% of the season's episodes are due.
- **Episode search** (batched by episode id list) for isolated items.

These thresholds are product decisions, held as constants, not configuration. When a season or series search is chosen, the covers list is expanded to every episode in that season or series.

Radarr has no grouping: each movie is one indexer query. The Radarr planner batches movies into a single multi-movie search command of a configurable batch size.

Planner contract (property-tested in the design): every input item is covered by at least one output command; no command mixes connectors; the number of commands never exceeds the number of items; no item is silently dropped; the plan is deterministic up to ordering. Each connector type supplies its own planner behind a common interface; the engine does not know how planning works.

### 6.3 Dispatch and tracking

Dispatch sends the command, records the upstream command id, and **immediately** updates last-searched-at for every covered item — the item moves to the back of the line when the search is *dispatched*, not when it completes, so in-flight items are never re-dispatched. (The implementation plan's tracker wording advances the timestamp on completion instead; the PRD's dispatch-time rule is the authoritative intent and the reason given — avoiding re-dispatch of in-flight items — only holds with dispatch-time updates.)

The tracker polls command status (queued, started, completed, failed, aborted, cancelled, orphaned) and marks terminal commands resolved. On completion it may trigger a targeted re-sync of the covered items to detect that a file appeared and adjust tiers. On failure or timeout it simply marks the command resolved — **there is no retry logic**; the items will naturally surface again when they are stalest. Commands that were in flight across a crash are detected on restart and re-polled.

### 6.4 Budgets and rate limiting

The budget system is the safety valve. It exposes one interface — how many commands may be sent to this connector right now, a report of a dispatch, and the health of the connector's indexers — and two implementations; the rotation engine does not know which is active.

**Default budget (no Prowlarr).** Per connector: a daily command limit (default 100), a maximum number of concurrent in-flight commands (default 2), and a minimum interval between commands (default 30 seconds). The daily limit is spread evenly across the day rather than allowing a burst — at 100 per day that is roughly one command every 14 minutes — so the budget is never consumed in the first hour. These are editable per connector in the UI with explanatory hints; most users should never need to change them.

**Prowlarr-aware budget.** When a Prowlarr connector exists, the budget source reads each indexer's query limits, each indexer's usage so far (from *all* sources — RSS sync, manual searches, other tools, Comradarr itself), which indexers are disabled, and which indexers serve which Sonarr/Radarr instance (by matching Prowlarr's application list to connector URLs and following Prowlarr's tag-based sync). The effective budget for a connector is the minimum over the indexers serving it of (80% of the indexer's limit minus its usage so far). Hourly and daily limits are normalised to a per-interval rate while respecting that hourly-limited indexers have burst constraints daily-limited ones do not. Disabled indexers are excluded. Data is cached for about five minutes and refreshed on health events or explicit operator refresh.

**Compound constraint.** Available = min(daily remaining, interval allowance, concurrency headroom). Concurrency matters most: a Sonarr instance running five concurrent searches queries every indexer five times at once.

The connector detail page shows, read-only, the indexers detected via Prowlarr, their limits, current usage and the computed effective budget, with a human-readable reason for the current constraint. The budget source is chosen at startup and re-resolved when connectors change. An open design question: whether a disabled indexer's share leaves the budget immediately or after a debounce.

### 6.5 Prowlarr health monitoring

A background monitor polls Prowlarr and publishes events for: an indexer being disabled (with duration and failure timeline), a high failure rate (over 30% of queries failing — degradation that has not yet caused a disable; the engine may reduce rate), and an indexer approaching its limit (over 80% used — informational, shown on the dashboard). A connector whose indexers are all disabled is skipped without error and resumes automatically.

### 6.6 Manual operations

Operators can request an immediate search for an item (priority search), pause or unpause individual items, pause or resume whole connectors, and trigger a manual full/deep/incremental sync. All of these are audited as user-initiated operational actions; routine ticks are not.

---

## 7. Connector communication and hostile-peer defences

**Status: Designed.**

### 7.1 What the connector layer guarantees

Connectors present typed, validated domain data to the rest of the system and absorb all transport concerns. Behaviours that must hold:

- API keys are sent only in the standard header, never in a query string. Logged URLs have query strings stripped; sensitive headers are redacted.
- Connect, read, write and pool-acquisition timeouts are always set and bounded (seconds to tens of seconds); an absolute wall-clock ceiling of about a minute bounds any single request including body streaming; a per-chunk idle timeout defeats slow-drip responses.
- Transient failures (server errors, timeouts, connection and DNS failures, TLS handshake failures) are retried with exponential backoff up to a bound and honour upstream retry-after hints; client errors (4xx), authentication failures and schema validation failures are permanent and fail immediately. The classification travels with the error so the UI can offer "retry" versus "reconfigure".
- Response bodies are capped by a **true byte budget** (default 256 MB, per-connector override) regardless of declared length; the full body is read before any parsing — there is no streaming-parse path, so a partial parse can never trigger action. Decompressed-to-compressed ratio is capped (about 100:1). The declared content type must be the structured-data type the upstream APIs actually use; anything else (a web page from a captive portal, a markup document from a misconfigured proxy) is rejected before the body is consumed. Parsing enforces nesting depth, container size and total node count limits.
- Redirects are **never followed**. A 3xx is an error shown to the operator ("redirect refused; check your proxy"), because a hostile clone could redirect the authenticated request elsewhere.
- Every string and collection field from upstream has a maximum size; numeric fields have plausible ranges; type coercion is disabled (a numeric field accepts only numbers). Content responses (series, episodes, movies) tolerate unknown fields so upstream additions do not break Comradarr; control-plane responses (system status, command status, indexer configuration) reject unknown fields.
- Validation failures are normalised into a structured error naming the field and constraint but **never the offending value** (it may be huge or sensitive), and never carrying raw request/response objects.
- Each connector keeps a consecutive-hostile-response counter. Five consecutive hostile responses mark it **degraded** (yellow badge, reduced dispatch); twenty mark it **unhealthy** (dispatch stops, health probes continue). Every success decrements; reaching zero restores healthy. Transport-level 5xx errors do not count as hostile. Thresholds are fixed in v1. Health transitions are published as events.
- Strings that originated from a connector are always escaped on render and are never used to construct selectors, patterns or code.

### 7.2 URL validation and SSRF defence

A connector URL is attacker-controllable input that determines where authenticated traffic goes. Rules:

1. Scheme must be http or https; a host is required; user-info and fragments are rejected (they indicate a pasted browser URL).
2. The host is resolved and **every** resolved address is classified. Always rejected: link-local (cloud metadata endpoints live there), multicast, unspecified, broadcast, documentation/test and benchmarking ranges. Allowed by default: loopback, private ranges (home LANs and container bridge networks), unique-local IPv6, carrier-grade NAT (overlay VPNs). Always allowed: public unicast. IPv4-mapped and compatibility IPv6 forms are unmapped and re-classified; internationalised hostnames are normalised; trailing dots are stripped. If resolved addresses span allowed and rejected categories, the URL is rejected.
3. The policy has three operator-selectable modes: **default** (above), **strict** (public addresses only, for cloud-hosted instances), **permissive** (allows even link-local; logs a prominent warning at every startup). The same policy governs notification destinations.
4. **Re-resolution on every request** defeats DNS rebinding: the host is resolved and classified again before each outbound call, the connection is made to a classified address, and the actual peer address is checked after connect. A failure surfaces as a specific connector error ("resolved to disallowed address").
5. TLS verification is on by default and cannot be disabled globally; per-connector skip-verify (badged) or custom CA bundle are the only overrides.

### 7.3 Connector creation pipeline

When an operator adds or edits a connector, validation runs cheapest-first and stops at the first failure with a specific message: (1) field validation — URL structure, key format, name; (2) URL classification; (3) a single authenticated connectivity check against the instance's system-status endpoint; (4) response shape validation — a failure means "this is not a Sonarr/Radarr/Prowlarr"; (5) API version compatibility. Only then is the connector persisted (with the key encrypted) and audited. Supported targets are Sonarr's v3 API (serving Sonarr v3 and v4), Radarr's v3 API, and Prowlarr v1. There is no version negotiation; a future incompatible upstream API gets a new client.

---

## 8. Events, live updates and notifications

**Status: Designed.**

### 8.1 In-process event bus and live stream

An in-process publish/subscribe bus connects background services to the API. Publishing is non-blocking and never raises. Events include sync completed/failed, rotation dispatched/tracked/idle, tier changed, indexer health, connector health, priority search completed, and auth/session events. Subscribers can be type-specific (internal consumers) or global (the live stream and the notification dispatcher). No event may carry a secret or a value derived from one, because events reach browsers.

Browsers receive events over a one-directional server-pushed stream (chosen over bidirectional sockets because the UI never pushes real-time data up, proxies need no special handling, and reconnection is native). Each client has a bounded queue; if a client is slow, events for it are dropped silently — the stream is a notification channel, never state replication, and the client re-fetches current state through normal page data. A heartbeat comment is sent roughly every 15 seconds to keep proxies from closing idle connections. Events are filtered by scope: system-scoped events (connector, sync, rotation, indexer health) go to admins; user-scoped events (your priority search completed, your session opened) go only to the owning user. The stream authenticates by session cookie only.

The frontend reacts to events by invalidating and re-fetching the affected page data, which is what drives the live dashboard.

### 8.2 Notifications

The notification system is a consumer of the bus, never a source. It pushes events outward to Discord, Slack, email, Telegram, ntfy, Gotify, Matrix, generic webhooks and dozens more, so security and operational events reach the operator when no tab is open.

**Channel kinds.** (1) A URL-addressed multi-service relay: the channel holds one destination URL (which embeds the destination's token). Operators wanting fan-out create several channels. (2) Generic webhook: URL, method (POST or PUT), optional headers (for bearer tokens), and a body template rendered from the event. (3) Email: a guided form (host, port, credentials, TLS mode — implicit TLS or STARTTLS; plaintext is not offered in the guided path) that assembles a relay-style mail URL; stored and dispatched like any relay channel.

**Secrets and hardening.** Channel configuration is encrypted with the same four-part layout and row binding as connector keys. Destination URLs go through the same classification policy and re-resolution-at-send discipline as connectors, with the same TLS overrides, and webhook requests never follow redirects. Send-time classification failures are permanent (no retry) and logged.

**Test before commit.** Saving a channel sends a real test message; only success persists the configuration and records last-tested/ok. Failure returns the specific error (TLS handshake, 404, URL parse error, unreachable) and leaves the previous configuration active. A channel can never be saved broken.

**Routing.** One enabled (user, event type, channel) row = one notification. Multiple rows fan out. No row = off. The UI is a matrix of event types (grouped: security, operational health, user-initiated) against channels with a toggle per cell. Predicate filters are reserved for later.

**Default routing profile** — seeded once, on a user's *first* channel only; later channels start with everything off so an operator who silenced an event is not re-subscribed:
- Security (on): new session opened; password changed; API key created or revoked; for admins, a burst of failed logins (five or more within five minutes); identity-provider failures; audit-write gaps; recovery-mode use.
- Operational health (on, admin only): connector reachability flipped; indexer disabled or re-enabled (coalesced); sync failing persistently (three or more consecutive failures); budget threshold crossed (80% of daily cap).
- User-initiated (on): priority search completed.
- Off but available: tier changes (high volume), per-cycle sync/rotation completions, connector add/edit/delete.

**Templates.** Every notification renders from a template with a deliberately tiny language: variable substitution and a single non-nesting conditional block for optional fields. No loops, expressions, attribute access or computed values — so a template editable by a (possibly compromised) admin account has no code-execution surface, and translators' placeholder validation understands it natively. Built-in defaults are translatable; per-user overrides for an (event type, channel kind) pair are stored verbatim and not translated. Lookup order at send: user override → translated built-in in the recipient's locale → English built-in; no merging. The editor pre-fills the English default and lists the variables each event exposes (for example a connector-unreachable event exposes connector name, type, URL, since-time and last error; a new-session event exposes user name, IP, user agent and time).

**Delivery.** Fire-and-forget from the bus: sends are scheduled concurrently with per-send timeouts and the subscriber never waits. Each notification gets an initial attempt and three bounded retries with growing delays and timeouts (initial 10 s; retries after 1 s, 5 s and 30 s with 15 s, 20 s and 30 s timeouts), then is abandoned with a warning log naming the event type and channel name (never the decrypted configuration). There is no dead-letter queue and no delivery table; the structured log is the delivery record. This is deliberate: durable delivery is a non-goal for a single-operator tool.

**Coalescing.** Operational-health events coalesce over a 60-second rolling window into one grouped summary notification (twenty indexers flipping in one poll, a cascade of sync failures during a network blip). Security and user-initiated events never coalesce. The window is a constant, not a setting.

**Kill switch.** A single global toggle (default on) silences all delivery while keeping channels and routes intact; every notification settings page shows a banner while it is off. Suppressed dispatches are still recorded.

**Audit boundary.** Creating/editing/deleting channels, routes and template overrides is audited (configuration changes). Individual deliveries are structured-log only (volume).

---

## 9. First-run setup and the HTTP boundary

**Status: Designed. The setup gate, bootstrap flow, boundary middleware, CORS, CSRF, headers, CSP and cookie matrix exist on the feature branch only as commented-out slots.**

### 9.1 The bootstrap problem and three credentials

Ownership of a fresh install is proven by **log access**: anyone who can read the process output already has meaningful control. Three distinct credentials with different lifetimes:

1. **Bootstrap token** — generated in memory at every startup while setup is incomplete, never stored in the database (only its hash is kept for comparison). At least 80 bits of entropy in an alphabet without ambiguous characters, printed as hyphenated five-character groups. Emitted on the process output inside a visually distinctive banner *and* written to a restricted-permission file in the container (because deployments swallow output inconsistently); the file is deleted on expiry or completion. The banner includes the suggested setup URL with the token as a parameter (bind-all addresses substituted with localhost), the absolute expiry time, an explanation, and a fixed warning that logs and the file are setup-time secrets not to be pasted into chats or trackers. Expires after **15 minutes**. If the process restarts, a fresh token is generated — restart access implies the same trust as log access.
2. **Setup-claim cookie** — issued when the token is validated; proves a specific browser owns the in-progress wizard. Scoped to the setup path, HttpOnly, Secure, strict same-site, **10-minute sliding lifetime** renewed by each wizard action.
3. **Admin session** — created only at successful completion.

The token lifetime is deliberately longer than the claim lifetime: an operator who steps away for 11 minutes can re-paste the token and resume; after 16 minutes a restart is needed. The claim validates the token **without consuming it** (consumption happens only at successful completion); a strict single-use mode exists for paranoid deployments at the cost of recoverability.

### 9.2 Setup state and gate

A single explicit flag drives everything: it is written as "not complete" the moment any setup state changes (such as the admin account being created) and flipped to complete only at the final step, compared by exact value. An interrupted setup that already created an admin is therefore still gated on next boot; there is no fallback to "an admin row exists". While incomplete, a gate redirects browser navigation to the setup page and answers API calls with "service unavailable — setup incomplete" (never 401, which would imply an authentication surface exists). The allowlist is minimal: setup routes, health, the CSP report endpoint, and the static assets the setup UI needs. The API description document is not in the allowlist.

The bootstrap token is per-process and in memory; production runs a single worker, and a warning is logged if multiple workers are detected during setup.

### 9.3 Claim flow

The claim endpoint, in order: if the requesting browser already holds a valid claim, renew it and succeed; if a different browser holds a valid claim, refuse with a conflict (claim-stealing defence); enforce a per-IP limit (10 attempts per hour, no lockout); validate the token in constant time; generate a random claim proof; persist it encrypted (first writer wins under concurrency; a loser sees the conflict); return it in the claim cookie. The setup page pre-fills the token from the URL and immediately strips it from the address bar so it does not land in history or referrers. Every attempt — granted, rejected (bad token, expired, rate limited, conflict) — is audited; the audit log exists from the very first write the application ever makes. Setup endpoints never log request bodies.

This claim is the **only** state-changing request in the whole application exempt from the CSRF origin check, because the allowed-origins list does not exist yet; it is protected instead by the token, the strict same-site cookie and the rate limit.

### 9.4 Wizard phases

**Phase 1 — Claim** (above).

**Phase 2 — HTTP boundary verification (mandatory, no skip).** The wizard records what it observed about the claim request: the socket peer address, the Host header, any forwarded-for chain, forwarded proto/host, and any standard Forwarded header. It uses these to infer the deployment shape and walks the operator through four test-driven steps; each proposes a value, explains it in plain language, accepts confirmation or correction, and runs a live test from the operator's own browser before persisting and advancing. Any failure returns a specific error and a retry.

- **Step A, proxy trust.** "Your request arrived from an internal address with forwarded headers, which means you are behind a reverse proxy. If you confirm, Comradarr will trust forwarded headers from that address as identifying your real client IP; otherwise all requests will appear to come from the proxy in your audit log and rate limiter." The operator confirms, edits (a range instead of an exact address, for container networks) or declines. Forwarded-header input from the form itself is rejected — trust is decided by socket peer alone. Live test: a second request echoes back the resolved client IP for the operator to confirm, and that IP is recorded in the audit entry.
- **Step B, public origin.** Scheme, host and port derived from the now-correctly-resolved request. Explained as the URL used for login redirects, identity-provider callbacks and future links, and the origin browser security checks compare against. Live test: a same-tab redirect round-trip to the candidate origin and back.
- **Step C, allowed origins and hosts.** Proposed as single-entry lists containing the public origin and its host; the rare operator with a separate frontend or dev instance adds entries. Live test: with the candidate values active, a credentialed cross-origin-style request including preflight succeeds, and a request with a non-allowed Host is rejected.
- **Step D, rollup.** All values shown with edit controls (editing re-runs the relevant test) and a typed confirmation before atomic commit.

**Phase 3 — Admin account.** Username, email and password (minimum length and a common-password denylist). This request runs through the now-active CSRF, CORS, host validation and proxy resolution — giving the defences their first real workout; a careless Phase 2 fails here with a clear error. On success: the admin user is created with the local provider, a session is issued, the claim cookie cleared, the token consumed and its file deleted, the flag flipped to complete (under a lock so a replayed completion gets a conflict instead of a second admin), and the operator lands in the application. Connector configuration is deliberately *not* part of the wizard so it gets full post-authentication protections.

### 9.5 HTTP boundary rules after setup

- **Proxy header trust.** Default before configuration: trust nothing; source IP is the socket peer. After configuration: only when the socket peer is in the trusted-proxy list are forwarded headers honoured; the effective client IP is the leftmost entry in the forwarded chain that is not itself a trusted proxy (chained proxies work); forwarded proto/host likewise. An empty or malformed chain falls back to the socket peer with a logged warning; a chain with non-address content is rejected entirely. Resolution happens once, early, and every consumer (rate limiter, audit log, redirect construction, CSRF, CORS) reads the same resolved values — inconsistency between consumers is the bug class to avoid. The trusted-proxy list for forwarding is separate from the trusted-proxy list for header *authentication*, because the populations may differ.
- **Host validation.** Requests whose Host is not in the allowed-hosts list are rejected (421). Wildcards for subdomain trees are allowed; a lone catch-all wildcard is not offered because it equals no validation. Absolute URLs are built from the configured public origin, never from request headers.
- **CORS.** Explicit origin allowlist, exact match after normalisation, no wildcards; default is the public origin alone. Allowed origins are echoed exactly with credentials allowed and a Vary-on-Origin header (non-negotiable, to stop caches cross-pollinating); preflights cache for ten minutes; disallowed origins get **no** CORS headers and an otherwise unchanged response (a special error would leak the allowlist); requests without an Origin are treated as non-cross-origin. Applies to the event stream too.
- **CSRF.** Primary: lax same-site session cookie. Secondary: every state-changing request must carry an Origin (or, as fallback, Referer) matching the allowlist; both absent → 403 with a generic "missing or invalid origin" that does not distinguish absent from wrong. Exempt: the bootstrap claim, and requests whose *validated* API key authenticated them (detected by the resolved mechanism, not header presence — a bogus key falls through to the cookie path where CSRF still applies). The UI server forwards the browser's real Origin on its backend calls so both layers see the genuine origin. An empty allowlist denies, never allows.
- **Security headers**, always on and not configurable: no-sniff; deny framing; strict-origin-when-cross-origin referrer policy; a permissions policy denying unused device APIs; HSTS for one year including subdomains (no preload — that is an operator decision) only over HTTPS; same-origin opener and resource policies; no server-version header, no powered-by header.
- **Content Security Policy**, strict: everything same-origin by default; scripts and styles same-origin plus a fresh per-request nonce; images same-origin plus inline data (for icons); no framing ancestors; base and form targets pinned to self; no plugins; upgrade insecure references. Unsafe-inline and unsafe-eval are forbidden everywhere, which constrains dependency choices. A report endpoint (unauthenticated, CSRF-exempt, reachable before setup, strict content-type and size caps, per-IP rate limited, silently drops anything it dislikes so probers learn nothing) logs violations with bounded context. A report-only mode exists for development and logs a loud warning at startup.
- **Cookies.** Exactly three: the session cookie (HttpOnly, Secure, lax same-site, whole-site path, host-only, no browser-side expiry in the design — the server-side row governs lifetime; *the implementation sets a 30-day max-age*), the setup-claim cookie (HttpOnly, Secure, strict same-site, setup path, 10-minute sliding), and a non-HttpOnly theme-preference cookie. A development-only switch removes only the Secure attribute and logs a warning at every start.
- **API description exposure.** The machine-readable API description and its interactive viewers require authentication (401 with no body and no CORS headers otherwise) and are rate limited to about ten requests per hour per IP; no CDN-hosted viewer assets. There is no hidden tier of endpoints — everything that exists is described; development-only endpoints are gated by flags rather than hidden. *The implementation currently serves these unauthenticated.*

---

## 10. Authentication, sessions, API keys and recovery

**Status: Partially built.** Providers, sessions, keys and rate limits exist with substantial tests; the provider chain is not wired into the request path as designed; password change, recovery mode, session listing and identity-provider logout are not built.

### 10.1 Model

Session-based authentication with an HttpOnly cookie is the universal representation; *how* a user becomes authenticated is pluggable. Three providers can coexist: local password (default), trusted header (behind an authenticating reverse proxy), and OIDC (direct relying party). Downstream code never cares which provider authenticated; the session records it. Design order per request: session cookie first (cheapest), then trusted header if enabled, then OIDC callback if in flight, with the local login form as the fall-through for unauthenticated users; API keys are checked separately on API endpoints. A future provider (LDAP, SAML, mTLS) is an addition to the chain.

Common deployment patterns: local plus trusted-header (proxy handles most access; local is break-glass); OIDC plus local (bootstrap admin keeps local login in case the identity provider breaks). Local login can be disabled entirely by a break-glass setting (the form is not rendered; the endpoint answers 403; the bootstrap admin row remains and can be re-enabled by clearing the setting).

### 10.2 Local password

- Passwords are hashed with a memory-hard, deliberately slow algorithm (Argon2id in the design) at parameters pinned in code — not configurable, because configurability here is a footgun — matching current interactive-authentication guidance. Parameters are embedded in each hash; on every successful login an outdated hash is transparently re-hashed, so hardening propagates as users log in.
- Unknown usernames trigger a dummy verification against a fixed placeholder so timing matches a real check; all failures return one generic "invalid credentials"; users carrying the externally-provisioned sentinel are rejected without verifying anything. Every attempt is audited with the provider and outcome (success with the username; failure with reason: unknown user, sentinel, wrong password).
- Rate limiting applies on two axes (section 10.5). A successful login always issues a brand-new session token (never upgrading a pre-existing anonymous cookie).
- Password change requires the current password, re-hashes the new one, rotates the current session and revokes all other sessions in the same transaction (on the assumption the change may be a response to compromise), and is itself rate limited.

### 10.3 Trusted header

For deployments where an authenticating proxy (forward-auth gateways and similar) attaches an identity header.

- **Trust is decided by the TCP socket peer only.** Forwarded-for and similar headers are never consulted for this decision, because they are attacker-controllable precisely when the peer is not yet trusted. The check runs before any header is read. The allowlist holds addresses and ranges (typical entries: the container bridge range, a specific proxy address, loopback).
- Configuration lives in the post-setup UI in the design (enable toggle, header-name picker with presets for common gateways plus custom, optional email header which becomes the preferred lookup key, provisioning policy, logout URL). Adding an allowlist entry opens a confirmation stating in plain language that any host in the range can log in as any user by setting a header, and requires the operator to **type the exact address being added** — validated server-side. An empty allowlist disables the provider; this is the default.
- Provisioning policy: **auto-provision** (match on email, else username; otherwise create the user with a sentinel password hash and the default role) or **strict match** (unknown identities are refused and must be pre-created).
- A normal session is minted on success; later requests use the cookie and do not re-validate the header. The audit entry records both the user and the proxy address that attached the header.
- A configured logout redirect URL (the proxy's sign-out page) is needed, otherwise logout is meaningless because the proxy re-authenticates immediately; the UI warns when it is missing. Startup logs a loud, unsuppressible warning if the provider is enabled with an empty or world-wide allowlist.
- The implementation reads these settings from environment variables, matches by username only, never mints a session, and is not reachable from the request path — see section 13.

### 10.4 OIDC

Comradarr acts as a relying party against any compliant provider (self-hosted identity servers, hosted identity services, workspace logins). Multiple providers may be configured, each with a short name and a display name shown as "Sign in with …" on the login page alongside the local form.

- Discovery and signing keys are fetched at startup and refreshed periodically (24 hours) and on signature failure (throttled to once per minute per provider, with one retry), so key rotation is handled gracefully; a stale key set is used if a refresh fails.
- Authorization-code flow with **mandatory PKCE (S256 only; plain is never accepted)** regardless of client type. State is a signed, single-use nonce bound to the browser's pre-login state; a nonce is also carried in the ID token and must match. Both expire after ten minutes.
- ID token validation: algorithm read from the header before any key lookup, with "none" and symmetric algorithms rejected outright and only an allowlist of asymmetric algorithms accepted; issuer, audience, expiry, issued-at (and not-before when present) with 60 seconds of clock-skew tolerance; nonce.
- Identity comes from subject, email and preferred username. Matching: by stored subject first; then by email under an **account-linking policy** — *link* (default: reuse the existing local user, record the session as OIDC-authenticated; the local password remains usable) or *require separate* (refuse if a local user with that email exists). The design links only when the provider asserts the email is verified; provisioning otherwise creates a user with a sentinel hash.
- Logout clears the local session and, if the provider advertises an end-session endpoint, redirects there to end the provider session too.
- Per-provider configuration in the design is deploy-time (environment), with the client secret supplied as a file and stored encrypted; a future iteration may move it into the wizard. The implementation requires the secret as a file, adds a per-provider "insecure discovery over plain HTTP" opt-in, and does not yet redirect to the provider on logout.

### 10.5 Rate limiting and abuse resistance

Tight on authentication, loose everywhere else — this is a single-user application on the operator's own hardware, and throttling the operator's own UI is user-hostile.

- **Per-IP login limits**: 10 attempts per minute and 50 per hour; exceeding returns 429 with a retry-after hint. Loose enough for a human mistyping, tight for automation.
- **Per-username backoff**: after repeated failures on a username, each further attempt incurs a server-side delay doubling 1, 2, 4, 8, 16 seconds and capping at 60. Keyed by the submitted (lowercased) username whether or not it exists, so enumeration by timing is impossible; cleared by success; never expires on its own.
- **Hard lockout is rejected** because it hands attackers a denial-of-service primitive.
- Also limited per IP: bootstrap claims, failed API-key authentications (per IP, not per key — per-key limiting is defeated by rotating guesses), API-description fetches, CSP reports and the health endpoint (small fixed limits). Password change is limited per user. Successful API-key traffic gets a generous per-key limit (several hundred per minute, configurable) to contain a leaked key. Session-authenticated browsing is not limited. The identity-provider callback is not limited (its abuse model differs and limiting would break legitimate retries).
- State is a hot in-memory cache backed by a persistent table, so restarting the container does not reset an attacker's limits.

### 10.6 Sessions

- Tokens have at least 256 bits of entropy; only a fast cryptographic hash is stored, so a database read cannot be replayed as a cookie. Validation hashes the incoming cookie and looks up by hash.
- **Absolute lifetime 30 days, idle lifetime 7 days** (both configurable); whichever comes first. Last-seen is updated on every request as a best-effort background write that can never fail the request.
- Unlimited concurrent sessions. A sessions page lists each active session (created, last seen, IP, user agent, provider, "this session" marker) with per-row revoke and "revoke all other sessions"; IP and user agent are never used for authorization decisions (mobile networks, VPNs, multi-egress proxies). A session revoked elsewhere disappears live.
- Any security-relevant change (password change; later, role change) rotates the current session and revokes the others.
- Revocation and logout **delete** the row — no "expired" tombstone, no replay window. Each revocation is audited.
- The UI server validates the cookie on every page request against the backend's session-validation endpoint; the backend is the single source of truth and the UI layer only does page-level gating and redirects. Validation failures other than an explicit "not authenticated" are treated as not authenticated (fail closed).

### 10.7 API keys

- Format: a distinctive human-readable prefix followed by a random part with 256 bits of entropy. The prefix lets secret scanners recognise leaked keys and lets users tell Comradarr keys apart. Only a fast hash of the random part is stored, plus the prefix and the last four characters for display.
- Created from a settings page with a name ("home-automation", "dashboard widget"), optional expiry, and an optional narrower scope. The plaintext is shown **exactly once** with a copy action and a "this will never be shown again" warning; it is never placed in page data that survives navigation, in storage, in the URL, in logs or in the audit log. Closing the dialog destroys it.
- Presented in a dedicated API-key header or as a bearer token. Values without the prefix are ignored without a database lookup.
- Revocation is immediate (the row and its scopes are deleted; there is no grace period) and audited with prefix and last four. First use is audited exactly once (so the operator sees when an integration came online) and last-used is tracked best-effort on every use — the single most useful fact on the key list ("which of my keys are actually in use"). Expiry must be enforced at authentication time (*the implementation stores but does not enforce it, and updates last-used only on first use*).

### 10.8 Password recovery

There is no in-band reset. The operator sets a recovery-mode break-glass setting and restarts; a recovery token in the same format and lifetime as the bootstrap token is printed to the log; it authorises a password-reset flow for the admin account; on success a recovery acknowledgement timestamp is recorded so that, if the setting is left on, subsequent boots refuse to issue a new token and log a warning telling the operator to clear it. Same trust model: log access is privilege. Recovery activation must be audited (*the implementation lacks an action code for it*).

---

## 11. Secrets, encryption and the audit log

**Status: Built and tested.**

### 11.1 Encrypt versus hash

Every secret is classified by what the application must do with it. Secrets that must be recovered in plaintext to be used — connector API keys (sent to Sonarr on every call), identity-provider client secrets, notification channel configuration, the setup-claim proof — are **encrypted** with authenticated encryption (AES-256-GCM in the design). Secrets that only need verification — passwords (memory-hard slow hash), session tokens and API keys (fast hash, because the inputs are already high-entropy random values and a slow hash would add only per-request cost) — are **hashed**. All comparisons are constant-time.

### 11.2 Encrypted-field layout and binding

Every encrypted field is stored as four parts: a fresh random 96-bit nonce per encryption (never derived, never counter-based, never reused — nonce reuse is catastrophic), the ciphertext, the authentication tag, and the **key version**. All four empty means no value; some empty means corruption, which is a hard error, never a silent empty. Each ciphertext is bound (as associated data) to the identity of its row and column — table, stable row key, column — so an attacker with database write access cannot move a ciphertext between rows to steal one connector's key under another's identity. Binding inputs are stable for the row's life (never names or URLs, which legitimately change). One fixed binding is frozen for the setup-claim proof so old ciphertexts remain readable.

### 11.3 Master key and versioning

A single master key is the root of trust and the one setting that must exist before launch; it may be supplied directly or as a file path (the file form wins with a warning if both are set; the file pattern is what secret-mounting mechanisms use and keeps the key out of process inspection). Additional versions can be registered; the highest version is current for new encryption; older versions remain for decryption only. A stored version that is not loaded fails loudly — never a silent re-encrypt. Rotation is designed as a resumable background re-encryption, with the worker itself deferred; the schema supports it from day one.

Startup **refuses to run** (no "weak key warning" continuation) if the current key is shorter than 32 bytes, all zeros or all ones, a single repeated byte, a monotonic sequence, has fewer than eight distinct byte values, has Shannon entropy below about four bits per byte, or matches a bundled denylist of known-bad keys (seeded with the usual "changeme / secret / password / zeros" patterns, intended to be expanded). The error names the failed check and never echoes the key. A key-generation helper exists so operators do not improvise. Only the current key is validated; a retired key that later lands on the denylist must still decrypt old rows.

### 11.4 The secret wrapper

Every secret in memory lives inside a wrapper type whose textual, debug and serialised forms are a fixed redaction marker; it is unequal to everything, cannot be hashed into a collection, and refuses implicit conversion. The plaintext is reachable only through one explicitly named "expose" operation, chosen so reviewers can enumerate every call site; the plan adds a build gate that fails when an expose call appears outside an allowlist with a justification. Static type checking rejects passing a wrapped secret where a plain value is expected. Three further nets: the logging pipeline redacts wrapped secrets anywhere in an event and redacts sensitive header names (authorization, cookie, set-cookie, API key) and secret-shaped values (password-hash shapes, three-part tokens, the API-key prefix pattern, versioned ciphertext shapes); serialisation renders wrapped secrets as the marker; and exceptions from outbound calls are stripped of raw request/response objects before they propagate.

Secret lifecycle for a connector key: enters only through the connector create/edit endpoint (whose request body is never logged); lives wrapped; is unwrapped only inside the encryption service and at the moment of header insertion for an outbound call; is displayed only as a mask plus last four; and is replaced, never revealed.

### 11.5 Database privilege separation

Three database roles, enforced at the database rather than in application code:
- **Migration role** — schema-changing rights; used only at startup before serving.
- **Application role** — read/write on every table **except** the audit log, where it may only insert and read. A logic bug or injection in the request path can forge new audit entries but can never alter or erase prior ones.
- **Audit-admin role** — read and delete on the audit log only, denied everything else; used solely by the retention sweep on a brief separate connection with its own credential (required at boot, at least 32 characters, never written into migration history).

Tests on the feature branch prove every cell of this matrix, including that the application role cannot perform any schema change and that no role but migration can update an audit row. In the bundled deployment these roles are created automatically with generated credentials; with an external database the operator either grants role creation or pre-creates the roles once (a pre-flight check turns a mid-migration privilege failure into a clear configuration error pointing at the runbook). All queries are parameterised; string-built queries are banned by lint.

### 11.6 Audit log

Append-only record answering "who changed what, and when", from the first row the application ever writes.

**In scope**: bootstrap token generation; every claim attempt and outcome; admin account creation; setup completion; every login attempt across all providers with the provider recorded; logout; session revocations (self and admin); password changes; recovery activation; API key creation, first use and revocation; connector add/edit/delete/pause/resume (URL and type recorded; the key never, only that it changed); HTTP boundary changes with old/new diffs; identity-provider configuration changes; notification channel/route/template changes; application config and secret updates; manual sync and search triggers; snapshot export and import; user create/update/delete and role changes.

**Out of scope** (structured log instead): routine sync and rotation ticks, health probes, individual rotation dispatches, individual notification deliveries. An action appears in exactly one stream.

Each entry's context payload has a stable shape per action and passes through the same secret redactor. The correlation id links the entry to the request's log lines. **Retention defaults to indefinite**; an optional cap (in days in the implementation; days or entry count in the design) is applied by a scheduled sweep under the audit-admin role (the design wants batched deletes and an audited sweep; the implementation deletes in one statement, hourly, unaudited). The admin-only audit UI lists entries newest-first with filters by action, actor, date range and free text, and streams a plaintext export. Two reserved columns allow a future hash chain for tamper-evidence against direct database compromise without a table-locking migration later.

---

## 12. Configuration snapshots (import/export)

**Status: Designed.**

A passphrase-encrypted single file captures the non-derivable state of an install: connectors with their plaintext API keys (decrypted from the source and re-encrypted under the passphrase), HTTP boundary configuration, trusted-header settings, identity-provider configurations with secrets, user accounts with their provisioning provider **but without password hashes** (users re-authenticate; hashes are not portable and transporting password material is the wrong instinct), API key metadata **with** plaintext keys (so integrations keep working), role assignments, and user preferences. Excluded: mirror tables (rebuilt by sync), the schedule (rotation re-establishes in days), planned commands, sync state, sessions, rate-limit state, and the audit log (entries are tied to the install that produced them; an audit-specific plaintext export exists separately).

Encryption derives a key from the passphrase with a memory-hard function at parameters deliberately heavier than interactive login (snapshot decryption is rare and offline attack is the threat), a random salt per export, and the same authenticated cipher as field encryption over the whole document; the parameters, salt and nonce are embedded in an authenticated header so future parameter changes do not break old files, and header tampering invalidates the file. The container format version (crypto primitives) is independent of the inner schema version (fields). Comradarr never stores the passphrase and cannot recover a file without it. The export wizard requires the passphrase twice, enforces a minimum length and the common-password denylist, builds the document in memory only, and names the file from the install's friendly name and a timestamp. The export is audited with high-level counts and size, never the passphrase.

Import is a wizard gated by an explicit "this is destructive" confirmation: upload, passphrase, decrypt, validate the schema version (one major version behind is supported through a translation layer; older is rejected with advice to step through an intermediate version), show a preview of what would change, then apply **in a single transaction**, re-encrypting every secret under the target's master key — no re-entry of secrets afterwards. Conflicts (for example a connector with the same URL) follow a per-section policy: replace (default — "I am restoring a backup"), merge, or skip. Success and every failure kind (wrong passphrase, corrupt file, version mismatch) are audited. Partial (section-selective) import is a later feature.

---

## 13. External integrations

| Product | Direction | What is read | What is written | Auth | Mode | Failure handling |
|---|---|---|---|---|---|---|
| Sonarr (v3 API; serves v3 and v4) | Both | System status and version; full series list with per-season statistics; episodes per series/season; quality profiles; command status | Episode search (list of ids), season search (series + season), series search (series id) | Per-instance API key in a header | Polling on sync cadences; command status polled every ~30 s | Retries for transient errors; health degradation on hostile responses; unreachable state on transport failure; never crashes the process |
| Radarr (v3 API) | Both | System status; full movie list; quality profiles; command status | Multi-movie search (list of ids) | Same | Same (Radarr uses only deep + full sync) | Same |
| Prowlarr (v1 API), optional | Read-only | Indexer list with limits; indexer statistics (query counts, grabs, failures) over a date range; indexer status (disabled, since, until); application list and tags (which indexers serve which Sonarr/Radarr) | Nothing | Same | Polled; cached ~5 minutes; health polled by a background monitor | Falls back to default budgets if unavailable; disabled indexers excluded from budget |
| Authenticating reverse proxies (forward-auth gateways) | Inbound | An identity header (username; optional email) from allowlisted socket peers only | — | Socket-peer allowlist | Per request | Untrusted peer → treated as unauthenticated |
| OIDC identity providers | Both | Discovery document, signing keys, tokens | Authorization requests, code exchange, optional end-session redirect | Client id + secret, PKCE | On login; keys refreshed daily and on failure | Generic login failure to the user; specific log events |
| Notification destinations (chat services, email, push services, webhooks) | Outbound | — | Rendered messages or structured webhook bodies | Embedded in the destination URL or headers (encrypted at rest) | Push, fire-and-forget with bounded retries | Abandoned after retries; logged; never queued durably |
| Monitoring scrapers / trace collectors | Outbound/inbound, opt-in | — | Operational metrics; trace spans | IP allowlist for the metrics endpoint | Pull (metrics), push (traces) | Disabled by default |
| Translation platform | Repository-level | Source catalogues | Translations arrive as reviewed contributions | — | — | — |

Comradarr never contacts anything the operator did not configure.

---

## 14. User interface

**Status: Designed. Nothing beyond a starter page exists.**

### 14.1 Shell and navigation

A persistent left sidebar lists the top-level destinations — Dashboard, Content, Connectors, Settings (with sub-areas), Audit log, Notifications, API keys, Sessions — mirroring the layout conventions of the rest of the media stack so the operator's mental model carries over. The sidebar collapses to an icon rail on medium screens and behind a menu button on small ones, and hosts the rotation heartbeat beside the wordmark. A command palette is explicitly deferred. All filter, sort, search and pagination state lives in the URL so views are bookmarkable and shareable. Pages render server-side first for instant first paint; forms work without client scripting and are progressively enhanced with pending states and optimistic updates followed by a refresh.

### 14.2 Screens

| Screen | Shows | Lets you |
|---|---|---|
| Setup wizard (pre-auth) | Token entry; four-step boundary verification with the observed/proposed/testing/committed affordance; admin account form with strength indicator | Claim, verify networking, create the admin |
| Login (pre-auth) | Local form (unless disabled); one "Sign in with …" button per identity provider; a banner when header auth is active | Log in |
| Dashboard | Completion statistics; rotation status and heartbeat; per-connector sync progress and health; search throughput; budget consumption with reason; indexer warnings; recent activity feed — all from a single composed page payload, live-updated | Glance; jump to detail |
| Content browser | Up to 500,000 rows with virtual scrolling; filter by connector, type, tier, has-file, paused; sort; debounced search (~300 ms); tier, last-searched, search count, file status per row; cursor pagination | Search now, pause/unpause an item, open detail |
| Item detail | Mirror fields, schedule state, recent commands covering it | Search now, pause |
| Connectors | List with health badges (healthy / degraded / unhealthy / unreachable), TLS-warning badge; add/edit form with live test; detail with sync status, last error, recent commands, inherited indexer limits and computed budget (read-only), per-connector rotation limits with hints | Add, edit (re-validated), delete, pause/resume, trigger sync, refresh indexer data |
| Rotation view | Current schedule snapshot, in-flight commands, history | Inspect |
| Settings: HTTP boundary | Current and observed values with inline test cards | Edit with live test before commit |
| Settings: identity | Trusted-header configuration with typed confirmation and missing-logout-URL warning; identity-provider list and secret rotation; local-login disabled indicator | Configure |
| Settings: connection policy | default / strict / permissive with explanatory copy and a destructive-choice warning on permissive | Choose |
| Settings: preferences | Theme (light/dark/system), locale (with "show incomplete translations" toggle), timezone, install name | Set |
| Settings: observability | Metrics endpoint toggle + scrape allowlist; trace export endpoint | Opt in |
| Settings: snapshots | Export wizard; import wizard with preview and conflict policy | Export, import |
| Notifications | Channels (list, create wizard incl. guided email builder, test button, last-test status); routes matrix; template editor with built-in default, variable reference and dropped-placeholder warning; kill-switch toggle and banner | Configure |
| API keys | Prefix + last four + last used; create dialog with optional scope picker and one-time reveal; revoke with confirmation | Manage own keys |
| Sessions | Active sessions with provider and current marker | Revoke one / all others |
| Audit log (admin) | Newest-first, filters, detail drawer with redacted context | Browse, export |

### 14.3 Visual language

- One committed token set drives every colour, spacing, radius, shadow and type value; component code never hard-codes values, so a theme swap touches one place. Light mode: near-white with a faint violet tint, charcoal text, white cards. Dark mode: deep navy-indigo with slate cards. Aurora green is the **operational** colour (healthy, active rotation, success); violet-blue is **informational** (hover, focus, links, callouts); red is reserved for destructive and error states; chart colours are for charts only.
- Prose and labels in a humanist sans-serif; **every numeral representing a count, timing, percentage or timestamp in a monospaced face** so live updates do not jitter horizontally.
- Density is a property of the surface, not the component: a scoped spacing override makes the content browser tight, the dashboard roomy and settings structured, without forking components.
- Subtle diagonal aurora gradient washes appear only in hero and section backgrounds, never behind data or forms.
- Iconography is a single consistent geometric line set; no custom icons in v1.

### 14.4 Motion contract

Exactly three motion patterns: the sidebar heartbeat (one slow low-opacity pulse roughly every two seconds while dispatching; static when idle, paused, pre-setup or without connectors); tint-on-change (a single ~200 ms background pulse on a card whose value changed, with the value itself swapping atomically; rapid bursts debounce to one pulse); and a staggered above-the-fold reveal on hard page loads only (not on in-app navigation). Reduced-motion preference collapses all three to instant state changes, without exception. No animation library is used.

### 14.5 Theme handling

Theme preference is three-valued (light / dark / system) and stored per user; authenticated users with an explicit choice are painted correctly from the very first server-rendered response; "system" users and unauthenticated visitors use a small preference cookie written before first paint on their first visit. The page must never flash the wrong theme. Switching is instant (a fade is a possible later refinement).

### 14.6 States and errors

Every error the UI shows comes from one standard structured error format carrying a stable type identifier (which doubles as the translation key), a title, status, a translated detail, an instance/correlation id, per-field errors for validation failures, domain context, and a retryable flag for connector errors. UI treatment is mapped once per error type: validation errors attach to fields; authentication errors redirect to login with a "session expired" notice; authorization errors show a "you don't have permission" page naming the permission; connector errors show a banner naming the connector with retry or reconfigure; unexpected errors show a generic surface with the correlation id for log lookup. Load-time errors render an error page ("this page cannot render"); action-time errors render inline ("this action failed, the page is still valid"). Empty states should explain the next step (no connectors yet → add one; no schedule yet → first sync in progress).

### 14.7 Responsiveness, accessibility, localisation

Works from roughly 360 px wide upward (operators manage from phones). WCAG 2.2 AA: everything keyboard-operable with visible focus rings and no traps; semantic elements first, ARIA only where needed (live regions for live updates, landmarks, described-by on help text); contrast verified in both themes; labels on every field; errors announced; unique page titles; icon-only controls carry screen-reader text; automated accessibility checks on every component test, manual screen-reader passes on major changes. All strings pass through translation from the first line of code; English only ships initially; locale is per-user with browser-language inference before login; locales under ~90% complete are hidden unless the user opts to see them (with a percentage badge).

---

## 15. Configuration and operations

**Status: Designed; the environment-settings loader, migrations and logging are Built.**

### 15.1 Two tiers of configuration

Environment settings hold only what must exist before start; everything else is runtime configuration in the database, collected by the wizard or edited in the UI with audit, immediate effect and test-before-commit. Rationale: environment values leak through process inspection, are hard to change safely on a running system, and demand the operator know the answer in advance. There are **no configuration files** of any format.

Pre-launch surface (design): the master key (required; direct or file); the database connection (defaulted to the bundled store; override for external); development-only toggles for insecure cookies and CSP report-only (both warn loudly at every start); observability toggles for log level and log format (console vs structured lines; the production image defaults to structured); break-glass toggles for recovery mode and disabling local login; per-provider identity-provider settings; the outbound URL classification policy. The implementation adds: the audit-admin credential, audit retention days and sweep interval, run-migrations-on-startup (off by default) and boot probes (on), session idle/absolute days, a log de-duplication budget, a dev run mode that binds to loopback, and — diverging from the design — trusted-header settings as environment values.

Runtime surface: public origin, allowed origins and hosts, trusted proxies, trusted-header authentication settings, session timeouts, sync intervals, rotation defaults and per-connector limits, notification kill switch, metrics/trace settings, install name, user preferences.

### 15.2 Deployment shape

One image containing the application, the pre-built UI and a bundled relational store run as a supervised sibling process, listening on a local in-container socket only. A single mounted volume holds the store's data. If an external database connection is configured, the bundled store is not started. The application runs as a non-root user, single worker, with periodic worker recycling. Inside the image a small front router sends API, health, metrics, setup and event-stream traffic to the backend process and everything else to the UI process; if any supervised process dies the container exits (no partial-availability mode). The operator typically places a reverse proxy in front; the wizard handles the consequences. Minimum external database major version is pinned to the bundled version so behaviour cannot differ between the two paths. Images are published under full version, minor, major and latest tags plus digest, for multiple CPU architectures, with a software bill of materials. Beyond the database nothing else is required — no cache server, broker, search index or separate worker.

### 15.3 Lifecycle, crash recovery and upgrades

Startup: database ready (run migrations if enabled, under an advisory lock so concurrent workers cannot race; pre-flight role check; connectivity probes; verify the database knows every audit action code) → setup state checked and bootstrap token printed if needed → services (crypto, audit, rate limits, auth, event bus, connector factory, budget resolver, sync, rotation, health monitor, notifications) → background loops, which no-op until setup completes. Shutdown reverses: cancel loops, wait, close outbound connections, close the database. Everything meaningful lives in the database, so a hard crash loses nothing: sync resumes from timestamps and fingerprints, rotation from last-searched values, in-flight commands are re-polled. Background loops catch all errors per tick, log them with structured context, and continue; persistent failures surface through deduplicated error logs and health badges rather than restart churn.

Upgrade = pull the new image and restart; migrations run before serving; a failed migration exits non-zero with a clear message. Migrations are **forward-only**; the rollback path is restoring the pre-upgrade backup and running the previous image — downgrading against a migrated database is unsupported and release notes say so. A "have you backed up?" reminder is logged when a pending migration is detected. Automatic pre-upgrade dumps are a possible later opt-in.

### 15.4 Backup and recovery

All persistent state is in the database — no file caches, no file sessions — so backing up the data volume (or the external database with the operator's existing tooling) is a complete backup; stop the container or use a filesystem snapshot for consistency. **The master key is not in the database and must be backed up separately.** Losing it makes connector API keys, identity-provider secrets and channel configurations unrecoverable — everything else survives — and recovery is an hour of re-entering secrets from the upstream applications, not a rebuild. Losing the database entirely means a fresh install: re-add connectors and let sync rebuild the mirror; what is genuinely lost is audit history, rotation positions (cosmetic) and preferences. Comradarr ships no backup command of its own.

### 15.5 Logging, health, metrics, privacy

- Two streams with a strict boundary: the audit log (database, who-changed-what) and the structured operational log (process output, what-the-application-did). Levels are strict: debug (internal state, never on by default), info (routine events: sync completed with counts, rotation tick summary, request completed with method, path with query *values* stripped, status, size, timing, resolved IP), warning (recoverable surprises), error (actual failures). No critical/fatal — an unrecoverable condition exits. Context (connector name, sync type, request id) is bound once per boundary; event names form a grep-friendly hierarchy. Hot loops emit one summary per tick; repeated errors are de-duplicated (one on onset, slow heartbeats, one on recovery). Request and response bodies are never logged. Tracebacks are logged as type, message, relevant frame and fingerprint — never frame locals. User identity goes in the audit log, not the operational log. Logs go to process output only; the container runtime's logging is the persistence mechanism.
- A health endpoint, unauthenticated and minimal (overall status plus per-component status; no versions, no timings), for orchestrator probes; returns healthy/degraded as success and unavailable when critical components are down. (*The implementation's health endpoint is a fixed stub that does not yet check the database.*)
- Metrics: an opt-in scrape endpoint in the common text exposition format, guarded by an IP allowlist enforced inside the application (default: deny all; loopback is not auto-allowed; miss → 403 with empty body; hit bypasses auth). Exposes request counts and latencies, sync durations, dispatch counts, tracking latencies, budget consumption, active sessions, pool saturation, process metrics — with connector names as labels but never user identity, IPs or user agents. Opt-in trace export to an operator-configured collector with the same label discipline. Disabled by default and unregistered when off (404, not 401, to avoid advertising the feature).
- Privacy: no phone-home of any kind; dependencies that bundle analytics clients are avoided; the only outbound traffic is to what the operator configured.

---

## 16. Non-functional requirements

- **Scale**: 500,000+ episodes and tens of thousands of movies per install without degradation; several connectors; selecting the next items to search must cost the same regardless of library size; the content browser pages by opaque cursor (constant cost at any depth) and virtualises rows; page-oriented endpoints compose their data with concurrent queries and return one payload per page.
- **Latency**: dashboard and browser pages should feel instant on local hardware; sync of a 500-series library should complete in about a minute for deep/full modes and under a second for incremental.
- **Budgets**: never exceed any indexer's limit; never consume more than 80% of it; spread evenly across the day; respect concurrency ceilings.
- **Reliability**: survive hard crashes with no state loss; background loops never die from a single failure; transient upstream failures never block later work; a hostile or broken connector degrades only itself.
- **Security**: fail closed everywhere (empty allowlists deny; unknown auth → anonymous; crypto errors → operator alert, never a silent empty); secrets never appear in logs, errors, events or responses; append-only audit by privilege.
- **Operability**: one setting to start; wizard-verified networking; clear operator-facing errors that point at the fix; no configuration files.
- **Quality bar** (from the design's testing philosophy): behaviour tested against recorded real upstream responses rather than hand-written mocks, with a periodic canary against live instances to detect drift; property-tested invariants for the planner, differ, cursor pagination, URL classifier and tier classifier; integration tests against a real database including the privilege matrix; every error type provoked by at least one test; automated accessibility checks; coverage observed, not gated.
- **Licence**: strong copyleft with a network-use clause; contributions accepted under the same terms; dependencies vetted for compatibility.
- **Versioning**: semantic versions starting at 0.1.0; breaking changes possible in minor bumps before 1.0 and called out in release notes; no fixed release cadence; no long-term-support promises.

---

## 17. Known weaknesses and improvement ideas

### 17.1 Validation gap

The heart of the product — sync, planning, rotation, budgets — has never run against a real library. The thresholds (season/series promotion rules, tiers at 90/180 days, 100 commands per day, 80% margin, 5/20 hostile-response thresholds, five-minute Prowlarr cache) are reasoned defaults, not measured ones. The rewrite should instrument these and expect to tune them; keep them as named constants with recorded rationale, and consider exposing the budget-related ones per connector as the design already does.

### 17.2 Divergences between design and the partial build that must be settled

| Topic | Design | Build | Recommendation |
|---|---|---|---|
| Provider chain | cookie → trusted header → OIDC → local; API key separate | cookie → API key; trusted header unreachable | Implement the designed chain; make the registry the single resolution path |
| Trusted-header config | database + UI, typed confirmation, header presets, email-first lookup, mints a session | environment settings, username-only, no session, confirmation setting unused | Follow the design |
| Provisioned users' role | admin in v1; admin permissions seeded | viewer; nothing seeded, so every guarded route denies session users | Seed the admin role; make provisioning default configurable |
| OIDC linking | link only local users with verified email; redirect to provider on logout | links any email match regardless of verification; no provider logout; sessions fail unless a provider row exists in the unused database table | Follow the design; pick one configuration source |
| Session cookie | browser-session cookie, server-side lifetime | 30-day max-age | Follow the design or justify the change |
| API keys | expiry enforced; last-used on every use | expiry unenforced; last-used only on first use | Fix |
| Rate-limit response | retry-after header | value in body only | Emit the header |
| API description | authenticated and rate limited | open | Gate it before any exposure |
| Health endpoint | real checks | fixed stub | Implement |
| Audit action vocabulary | one family per event | overlapping login/claim families; no recovery-activation code; planned "30" is 29 | Define a single canonical, documented vocabulary |
| Retention sweep | batched, audited, days or count | single unbounded delete, unaudited, days only | Batch and audit |
| Priority search | consumed rows deleted | marked consumed | Either is fine; decide |
| Channel kinds | email is a guided relay form | distinct email kind | Decide |
| Connector limits | daily/concurrent/min-interval columns with defaults | free-form limits, no defaults | Model explicitly |
| Mirror fields | quality, path, sizes, file ids, year | thinner, free-form metadata | Model what rotation and display need |
| Master key length | at least 32 bytes | accepts longer keys that then crash | Validate exact length |
| Docs | — | readme/changelog lag; runbook variable names and header names wrong; stray "Whisparr" claim | Keep status honest |

### 17.3 Design-level open questions and risks

- The dispatch-time versus completion-time update of last-searched-at is stated inconsistently between the PRD and the plan; the PRD's dispatch-time rule is the one that prevents duplicate in-flight searches.
- Whether a disabled indexer leaves the budget immediately or after a debounce.
- The denylist of weak master keys is a four-entry seed; sourcing a real corpus is unresolved.
- The in-memory bootstrap token imposes a single-worker requirement; a multi-worker future needs shared claim state.
- Identity-provider configuration straddles environment and database; pick one (the database, with the same encrypted layout, fits the two-tier model better).
- The single-process event bus means live updates and notifications cannot scale past one process — acceptable for the audience, but state it.
- Notification delivery is intentionally non-durable; if operators report missed security alerts, a small durable attempt table may be worth the operational surface.
- Hash-chained audit tamper-evidence, partial snapshot import, mutation testing, end-to-end browser tests, a command palette, per-connector hostile-response thresholds, key-rotation worker, pre-upgrade automatic backups and role-management UI are all consciously deferred.
- The recorded-fixture testing strategy depends on maintainers having access to live upstream instances; budget for it.
- The content browser at 500,000 rows with URL-driven state and virtual scrolling has never been built; prototype early.
- A connector that both serves content and is reached through Prowlarr relies on URL matching between Comradarr's connector URL and Prowlarr's application entry; container DNS names versus IPs will break this matching unless normalised or operator-overridable.

### 17.4 Things the rewrite should keep exactly

The rotation-not-queue model with its single timestamp of state; cover-list expansion on season/series searches; tier computed only by sync; most-restrictive-indexer-minus-margin budgeting; the three-credential bootstrap and test-driven networking wizard; re-resolve-and-classify on every outbound request with redirects never followed; the four-part encrypted field with row binding and key version; the secret wrapper discipline; database-privilege-enforced append-only audit; the audit-versus-operational-log boundary; test-before-commit for channels and settings; the constrained template language; the exact-match, empty-means-deny allowlist rule everywhere; and the motion contract.

---

## 18. Glossary

- **Connector** — a configured Sonarr, Radarr or Prowlarr instance with its URL, encrypted key and settings.
- **Mirror** — Comradarr's local cache of what the connected instances know; rebuilt by sync; never authoritative.
- **Rotation** — the perpetual cycle in which every library item is searched in order of staleness; there is no "done".
- **Schedule item** — one row per searchable item carrying tier, last-searched time, search count and paused flag.
- **Tier** — priority class 0–3 (Missing, Recent, Monitored, Completed); lower rotates faster; computed by sync.
- **Stale** — searched longest ago; never-searched is stalest of all.
- **Planner** — groups due items into the fewest search commands (episode / season / series / movie batch) that cover them.
- **Covers list** — every item a command searches, including ones not individually due; all of them move to the back of the rotation at dispatch.
- **Planned command** — a dispatched search and its lifecycle.
- **Priority search** — an operator's "search now", dispatched ahead of rotation and outside the daily budget.
- **Budget** — the number of commands that may safely be sent to a connector in the current window; from conservative defaults or from Prowlarr data.
- **Safety margin** — the 20% of each indexer's limit Comradarr never uses, reserved for other traffic.
- **Fingerprint** — a compact per-connector summary of library state used to skip unchanged series during incremental sync.
- **Incremental / deep incremental / full sync** — the three sync modes, trading calls for certainty; only full sync detects removals.
- **Hostile response** — an upstream response that is oversized, malformed, wrongly typed or fails validation; counted toward degraded/unhealthy.
- **Degraded / unhealthy / unreachable** — connector health states driving dispatch rate.
- **URL classification policy** — default / strict / permissive rules deciding which resolved addresses an outbound URL may target.
- **DNS rebinding** — the attack that re-resolution-on-every-request defeats.
- **Bootstrap token** — the short-lived log-printed proof of ownership that claims the setup wizard.
- **Setup-claim cookie** — the browser-bound proof that a specific browser owns the in-progress wizard.
- **HTTP boundary** — the resolved client IP, scheme, host and origin trust that every security check reads from one place.
- **Test-driven configuration** — propose, explain, confirm, live-test, then commit; failure keeps the old value.
- **Trusted-header auth** — identity supplied by an allowlisted upstream proxy, trusted only by socket peer.
- **OIDC / PKCE** — federated login as a relying party; PKCE binds the authorization code to the initiating client and is always required.
- **Sentinel password** — a non-hash placeholder stored for externally provisioned users so local login can never succeed for them.
- **Absolute / idle timeout** — session lifetime limits (30 days / 7 days by default), whichever first.
- **Secret wrapper** — the type that renders secrets as a redaction marker everywhere and exposes plaintext only at named, auditable call sites.
- **Key version** — the registry index stored with every ciphertext so keys can rotate gradually.
- **Row binding** — the associated data tying each ciphertext to its table, row and column.
- **Audit log** — the append-only who-changed-what record, write-protected by database privilege.
- **Structured log** — the operational what-happened stream on process output.
- **Notification channel / route / template** — a destination; a (user, event, channel) subscription; the message rendered for an (event, channel kind).
- **Coalescing window** — the 60-second grouping of operational-health notifications.
- **Kill switch** — the global toggle that suppresses all notification delivery without deleting configuration.
- **Configuration snapshot** — the passphrase-encrypted export of non-derivable state for migration or restore.
- **Page payload** — a single composed response shaped for exactly one screen, replacing many small calls.
- **Keyset (cursor) pagination** — paging by the last row's sort value and id; constant cost at any depth.
- **Heartbeat / tint-on-change / page cascade** — the three permitted motions.
- **Watching the Sky** — the visual direction: calm atmospheric observation; aurora green for operation, violet-blue for information.
