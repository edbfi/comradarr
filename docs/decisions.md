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
with the audit module.

### D17. Deployment with a separate database

The legacy spec describes one image with a bundled relational store, roles created automatically
with generated credentials, and backup by copying one volume (§2.2, §11.5, §15.1, §15.2, §15.4, §16). With
PostgreSQL as a separate service (D5), role provisioning, the first-run requirements and the
operator's backup story need a new design. Closes with the deployment spec.

### D18. Runtime validation gaps

Not yet validated for this stack: browser interaction with a real component, production containers,
realistic load, and job recovery after a restart. Hydration is validated: the e2e smoke test waits
for the hydrated app in Chromium against the built server, with no console errors.
A crash test doesn't prove recovery from power loss or storage faults. PostgreSQL backup and restore
hasn't been validated; the procedure is still to be defined and tested, and the database and the
master key must be restored together. Each closes with the work that first depends on it.

### D19. One process

The deployment assumes one application process per database. Horizontal scaling, job coordination
across processes, a shared first-run claim and live updates across processes would need a new
design. Stays open as an accepted limit.
