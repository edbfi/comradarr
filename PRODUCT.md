# comradarr product context

<!-- impeccable:product-schema 1 -->

## Product Purpose

comradarr coordinates recurring searches for missing movies and episodes and for upgrades to existing files across the owner's Sonarr and Radarr instances. It chooses what to search next, prioritizes missing items and groups searches to cover more of the library within the available indexer budget. Sonarr and Radarr run the searches and handle downloads.

The rotation overview at `/dashboard` is the signed-in owner's home page. At a glance it should explain what is running or waiting and why, what will happen next, and what recent searches covered. When the owner connects Prowlarr, the overview shows relevant indexer health, configured query and grab limits, usage and remaining allowances where known. If several libraries draw on the same allowance, the owner should see what that means for their next search. Without a Prowlarr connection, the overview still explains the rotation using comradarr's own activity and pacing.

The library is there when the owner wants detail. Sonarr and Radarr each manage one file for a given movie or episode, so owners can run separate instances to keep HD and 4K copies side by side. An anime instance can have its own library and release preferences. The owner can open any copy, see its search history, understand when it is due again, and pause it or request a priority search independently of copies in other instances.

Each Sonarr or Radarr instance owns its titles and files. comradarr keeps a local mirror of every connected library, reading through the instance's API and copying the fields it needs for search, item detail and history. Sync flows from the instance to comradarr. If a connection drops, the owner can see when the mirror was last updated, and sync catches up when the instance returns. comradarr keeps its own durable record of scheduling decisions, search commands and outcomes it can confirm. A finished search and a confirmed upgrade are separate events. If the source reports a better file, comradarr can record that observation even when the cause is unknown. The owner should be able to leave it running overnight, restart it without losing its place and diagnose a failed connection without exposing an API key.

## Platform

web

## Users

Sidebar Dashboard, Content, Rotation, Connectors, Notifications, Audit log, Settings. Slow heartbeat beside wordmark concept. One owner account; operator/admin screen labels denote task focus, not roles.

## Primary tasks

- **Operator:** Sign-in and first connector setup. Proposed route: `/login → /setup`.
- **Operator admin:** Rotation overview. Proposed route: `/dashboard`.
- **Operator:** Content inspection and item controls. Proposed route: `/content/northbound-s02e04`.
- **Operator:** Rotation and coverage history. Proposed route: `/rotation`.
- **Admin:** Connector administration. Proposed route: `/connectors`.
- **Admin:** Rotation limits and notification routing. Proposed route: `/settings/rotation`.
- **Admin:** Access verification and preferences. Proposed route: `/settings/access`.
- **Admin:** Audit and error inspection. Proposed route: `/audit`.

## Positioning

Sonarr and Radarr monitor newly posted releases. comradarr adds recurring searches of the back catalogue, including for items already on disk. A season search can cover multiple episodes with one command, and every episode it covers moves to the back of its rotation tier.

Sonarr and Radarr query the indexers configured in each instance. Prowlarr can sync indexer entries into those instances and proxy searches sent to those entries. For indexers added independently, Sonarr and Radarr use the endpoint the owner configured. Connecting Prowlarr to comradarr grants read-only visibility into indexer limits, usage and health. The owner can tune search pacing. The budget calculation, including its reserve and fallback defaults, is specified in [the indexer budget spec](docs/SPEC.md#indexer-budget).

## Operating Context

- **Who and where.** A self-hosting home-lab operator who already runs a media stack: Sonarr, Radarr, usually Prowlarr, a download client and a media server. The install is one person, one instance and one account on their own hardware, often behind a reverse proxy and often on plain HTTP inside a LAN.
- **Scale.** Synchronization, scheduling, the overview and item lookup must remain usable as libraries grow. Design for installations with hundreds of thousands of episodes, a million or more, alongside large movie collections. Use representative library sizes in testing and measure performance on the current stack.
- **The surrounding stack.** comradarr reads library state from Sonarr and Radarr and sends them search commands; it reads indexer limits, usage and health from Prowlarr as information only; it can push alerts to notification destinations the operator configures. comradarr works with the latest stable Sonarr, Radarr and Prowlarr only (D23).
- **How it runs.** The target is a self-hosted web app in one container, with one process, one HTTP port, a locally persisted embedded Turso database and a separately stored master key. [D5](docs/decisions.md#d5-local-embedded-turso-through-drizzle) tracks the move from the current PostgreSQL setup. The operator manages it from a browser: desktop first, with the phone a real but secondary use.
- **Rituals.** First run is claimed with a one-time token printed to the console, which creates the owner account; first run then offers two-factor, verifies networking from the operator's own browser (each network setting is tested before it's saved; the app's own address is only checked, never saved), and adds the first connector (D20). Day to day the operator glances at the rotation overview, inspects or searches individual items, checks connector health and the inherited budget, and reviews the audit log when something changes or fails.
- **Language.** English, the default, and Danish, with dates and numbers formatted for the operator's language (D21).
- **Project state.** [AGENTS.md](AGENTS.md) has the current status.

## Product requirements

- Rotation never finishes and is never a queue. Missing, Recent, Monitored, Completed all remain in rotation.
- comradarr sends search commands only, does not download or inspect download queues. No artwork/poster library.
- Supported connectors Sonarr, Radarr, optional Prowlarr only. Indexer limits inherited read-only.
- Use example limit 500, 20% reserve 100, effective budget 400; 126 used plus 274 available equals effective 400. Label reserve outside effective budget.
- Test network changes before commit. Stored secrets never revealed. Global no-connector empty state actionable.

## Confirmed visual direction

Aurora Observatory. Deep arctic navy and calm aurora green with violet-blue information. Gentle aurora as a restrained heading wash; actual tables and forms flat. Humanist labels, mono numerals. No radar scope, no poster art. The selected direction is confirmed; the layouts and exact token values are a proposed design seed for review.

## Evidence on Hand

What exists:

- `docs/decisions.md`: the stack and architecture decisions, decided and open.
- `panda.config.ts`: the seed tokens, still a proposed design seed.
- `.impeccable/surfaces/route-*.md`: proposed surface briefs, one per route (login, setup, dashboard, content, rotation, connectors, settings/rotation, settings/access, audit).
- `tests/fixtures/demo-fixtures.json`: a fictional, dated demo snapshot (tier counts, daily commands and items covered, indexer budget arithmetic, three connector names) that the briefs use as canonical demo data.
- `static/comradarr-icon.svg`: the product icon, used as the favicon and in the README.
- [README licensing grant](README.md#license), with the full terms in `LICENSE`. Contributions are accepted under the same terms, and dependencies are checked for a compatible licence.

What doesn't exist, and must not be fabricated:

- A release, container image or deployment of the rewrite, or any product module after `i18n`. The rewrite has only its ground floor, `secrets` and `i18n` (`docs/SPEC.md`).
- Users, customers, testimonials, case studies, press, adoption or download figures, and any pricing or commercial offering.
- Measured performance, coverage, throughput or budget data. The demo fixture values are fictional. The defaults the legacy app's design reasoned out (tier windows, daily command limits, the safety margin, health thresholds, the planner's grouping rules, the Prowlarr cache) never ran against a real library, real indexers or real users: modules instrument each default and keep it as a named constant with its reason, so measurements can tune it, the defaults the owner can change included (SPEC.md rows 12 and 16).
- Screenshots of a working interface.
- Integration logo assets. Use approved real marks or labelled generic icons (DESIGN.md).
- Recorded Sonarr, Radarr or Prowlarr responses. Modules test against them ([SPEC.md Testing strategy](docs/SPEC.md#testing-strategy)), and none are in `tests/fixtures/` yet.
- Evidence from the old code branches. `legacy-old/v1` and `feat/comradarr-implementation-plan` are reference-only behaviour history, not proof of how the rewrite behaves.

## Product Principles

1. **The indexer budget is sacred.** Staying inside every inherited indexer limit, with the safety reserve kept and the work spread through the day, outranks covering items faster. Indexer limits are read, never set.
2. **Never finished, never a queue.** Every item stays in rotation and is ordered only by tier and staleness. comradarr never presents progress toward "done", a queue depth or an exhausted library; a paused or budget-limited rotation is a temporary state, not an ending.
3. **Beside the stack, never inside it.** comradarr reads the library and outcome data it needs and sends search commands through the configured apps' APIs. It doesn't download, manage files or query indexers, and new scope that crosses that line needs a deliberate decision.
4. **Report what comradarr actually did.** Commands sent, items covered, budget used and connector health are facts it owns; record upgrades from the owning Sonarr or Radarr instance and attribute one to a search only when the evidence links them. Errors say what went wrong and how to fix it, without blaming the operator.
5. **Built for one owner on their own hardware.** One owner account on one instance, with no roles and no multi-tenancy, so choose the simplest design that allows (one process, no broker). Data stays on the instance: no telemetry, no phone-home, and no outbound traffic except to what the owner configured, and no dependency that bundles an analytics client. Security is structural rather than procedural: fail closed, never reveal a stored secret, and let the database enforce the append-only audit log.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

Semantic elements come first, and ARIA only where they fall short (landmarks, live regions for live updates, help text linked to its field). Errors are announced, every page has a unique title, icon-only controls are named for screen readers, nothing traps the keyboard, contrast is checked in every theme, and major changes get a manual screen-reader pass.
