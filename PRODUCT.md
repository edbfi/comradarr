# Comradarr product context

<!-- impeccable:product-schema 1 -->

Calm perpetual search rotation for Sonarr/Radarr, maximizing item coverage within inherited indexer budgets.

## Platform

web

## Users

Sidebar Dashboard, Content, Rotation, Connectors, Notifications, Audit log, Settings. Slow heartbeat beside wordmark concept, static in raster. One owner account; operator/admin screen labels denote task focus, not roles.

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

Sonarr and Radarr search once: after an item is downloaded, or after an automatic search fails, they stop looking. Comradarr treats the whole library as a perpetual search rotation instead. Every episode and movie the connected instances know about, with or without a file, keeps getting searched again in order of tier and staleness, so missing items keep being looked for and existing files keep being checked for upgrades. There is no "done".

The mechanism that sets it apart is coverage within an inherited budget. Each indexer query is spent on as many items as possible: a season or series search covers every episode in it, and every covered item moves to the back of the rotation. The budget is never Comradarr's own: it is the most restrictive indexer limit read from Prowlarr, minus a safety reserve for traffic Comradarr doesn't control (20% by default, adjustable by the owner), or conservative defaults without Prowlarr. The operator can tune how hard Comradarr works, but never the indexer limits.

Comradarr sits beside Sonarr and Radarr, never between them and anything else. They query the indexers and download; Comradarr only tells them what to search next.

## Operating Context

- **Who and where.** A self-hosting home-lab operator who already runs a media stack: Sonarr, Radarr, usually Prowlarr, a download client and a media server. The install is one person, one instance and one account on their own hardware, often behind a reverse proxy and often on plain HTTP inside a LAN.
- **Scale.** Libraries of tens of thousands of movies or hundreds of thousands of episodes (the legacy design targets 500,000+ episodes per install), against indexers that typically allow somewhere between fifty and a thousand queries a day. Exceeding an indexer's limit risks a temporary or permanent ban.
- **The surrounding stack.** Comradarr reads library state from Sonarr and Radarr and sends them search commands; it reads indexer limits, usage and health from Prowlarr as information only; it can push alerts to notification destinations the operator configures. The legacy targets are Sonarr's v3 API (serving Sonarr v3 and v4), Radarr's v3 API and Prowlarr v1; the spec verifies them.
- **How it runs.** A self-hosted web application in one container, as one process on one HTTP port, with PostgreSQL as a separate service (D4, D5); how it ships is open (D17). The operator manages it from a browser: desktop first, with the phone a real but secondary use.
- **Rituals.** First run is claimed with a short-lived token printed to the process log; networking is then verified from the operator's own browser before it's saved, the owner account is created, and connectors are added after sign-in. Day to day the operator glances at the rotation overview, inspects or searches individual items, checks connector health and the inherited budget, and reviews the audit log when something changes or fails.
- **Project state.** Nothing runs yet. The rewrite has context and tooling only, with no approved `docs/SPEC.md`; the previous version (`legacy-old/v1`) and the partial backend (`feat/comradarr-implementation-plan`) are reference only.

## Product requirements

- Rotation never finishes and is never a queue. Missing, Recent, Monitored, Completed all remain in rotation.
- Comradarr sends search commands only, does not download or inspect download queues. No artwork/poster library.
- Supported connectors Sonarr, Radarr, optional Prowlarr only. Indexer limits inherited read-only.
- Use example limit 500, 20% reserve 100, effective budget 400; 126 used plus 274 available equals effective 400. Label reserve outside effective budget.
- Test network changes before commit. Stored secrets never revealed. Global no-connector empty state actionable.

## Confirmed visual direction

Aurora Observatory. Deep arctic navy and calm aurora green with violet-blue information. Selected board's gentle aurora heading translated into restrained heading wash; actual tables and forms flat. Humanist labels, mono numerals. No radar scope, no poster art. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Evidence on Hand

What exists:

- `docs/product/legacy-spec.md`: the imported product and behaviour specification from before the rewrite. Its designed behaviour has never run against a real library, real indexers or real users, and its thresholds are reasoned defaults, not measurements (§0, §17.1).
- `docs/decisions.md`: the stack and architecture decisions, decided and open.
- `docs/design/references/aurora-observatory.webp`: the reference board for the selected visual direction.
- `docs/design/screens/01-entry-and-setup.webp` to `docs/design/screens/10-states-and-components.webp`: ten generated mockups (eight desktop boards covering the nine routes, a mobile board and a states board). They're proposed design seeds; their body copy, chart axes, icons and glyphs are illustrative raster renderings.
- `docs/design/tokens.json` and `docs/design/tokens.css`: proposed seed tokens, marked `proposed-seed`.
- `.impeccable/surfaces/route-*.md`: nine proposed surface briefs, one per route (login, setup, dashboard, content, rotation, connectors, settings/rotation, settings/access, audit).
- `tests/fixtures/demo-fixtures.json`: a fictional, dated demo snapshot (tier counts, daily commands and items covered, indexer budget arithmetic, three connector names) that the briefs use as canonical demo data.
- `public/comradarr-icon.svg`: the product icon, used in the README.
- `LICENSE`: the GNU Affero General Public License, version 3.

What doesn't exist, and must not be fabricated:

- A running application, release, container image or deployment of the rewrite, or an approved `docs/SPEC.md`.
- Users, customers, testimonials, case studies, press, adoption or download figures, and any pricing or commercial offering.
- Measured performance, coverage, throughput or budget data. The demo fixture values are fictional, and the legacy defaults (tier windows, daily command limits, the safety margin, health thresholds) are unvalidated.
- Screenshots of a working interface. The screens are generated mockups, not captures.
- Integration logo assets. Generated connector logos in the mockups must not be reproduced; use approved real marks or labelled generic icons (DESIGN.md).
- Recorded Sonarr, Radarr or Prowlarr responses. The legacy quality bar calls for them, and none are in `tests/fixtures/`.
- Evidence from the legacy branches. `legacy-old/v1` and `feat/comradarr-implementation-plan` are reference-only behaviour history, not proof of how the rewrite behaves.

## Product Principles

1. **The indexer budget is sacred.** Staying inside every inherited indexer limit, with the safety reserve kept and the work spread through the day, outranks covering items faster. Indexer limits are read, never set.
2. **Never finished, never a queue.** Every item stays in rotation and is ordered only by tier and staleness. Comradarr never presents progress toward "done", a queue depth or an exhausted library; a paused or budget-limited rotation is a temporary state, not an ending.
3. **Beside the stack, never inside it.** Comradarr reads libraries and sends search commands, nothing more. It doesn't download, manage files or query indexers, and new scope that crosses that line needs a deliberate decision.
4. **Report what Comradarr actually did.** Commands sent, items covered, budget used and connector health are facts it owns; whether a better release was found belongs to Sonarr and Radarr. Errors say what went wrong and how to fix it, without blaming the operator.
5. **Built for one owner on their own hardware.** One owner account on one instance, with no roles and no multi-tenancy, so choose the simplest design that allows (one process, no broker). Data stays on the instance: no telemetry, no phone-home, and no outbound traffic except to what the owner configured. Security is structural rather than procedural: fail closed, never reveal a stored secret, and let the database enforce the append-only audit log.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

This application is a planned rewrite. There is one owner account: the legacy spec's planned Operator and Viewer roles and its provisioned users don't apply, and operator and admin labels describe task emphasis, not roles.
