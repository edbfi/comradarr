# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

- Planning-only: there is no `backend/`, `frontend/`, `pyproject.toml` or `package.json`. Don't scaffold application code, package toolchains or placeholder tests unless the task explicitly asks for implementation; `prek.toml` gains application hooks only alongside real source.
- `[x]` checkboxes, commands and file paths in `docs/` describe work from the `feat/comradarr-implementation-plan` branch, not this tree. Confirm against the filesystem before treating anything as existing.

## Checks

- `SKIP=no-commit-to-branch prek run --all-files` is the only check, and matches CI (`.github/workflows/ci.yml`). Without the `SKIP`, `no-commit-to-branch` fails whenever you're on `main`.
- To run one hook: `prek run --all-files <hook-id>`, e.g. `prek run --all-files check-toml`.
- `gitleaks` and `detect-private-key` scan every file, including docs. Use obvious placeholders in examples of keys, tokens or DSNs.

## Commits and PRs

- Commit messages and PR titles use Conventional Commits (the `conventional-pre-commit` commit-msg hook and the shared PR policy workflow enforce this).
- PR commits need a genuine `Signed-off-by` that matches the author (`git commit -s`). This overrides the "no DCO sign-off" text in PRD §23.
- Renovate owns ongoing dependency updates and their merges, including the pinned `edbfi/automation` `v3.0.1` refs. Leave version bumps to Renovate unless the task asks for one. Read `CI.md` before changing workflows, `renovate.json` or the merge policy.

## Planning documents

- `docs/comradarr-prd.md` (~390 KB) and `docs/comradarr-implementation-plan.md` (~200 KB) are too large to read whole. Run `grep -n '^#' <file>` and read only the section you need. Read them before implementing a feature or changing requirements.
- Precedence: implementation plan §3.1 "Architectural decisions" > the plan's later checklists and §3 assumptions > PRD prose on the same topic. Example: §3 says a `tailwind.config.js` stub is committed, but §3.1 says no `components.json` or stub. Follow §3.1.
- `RULE-*`, `RECIPE-*`, `ANTI-*`, `PATTERN-*` IDs and "backend/frontend rules §N" in the plan refer to the retired `.augment/rules/{backend,frontend}-dev-pro.md`. Those files are gone and the IDs don't exist in `.agents/rules/`, so don't search for them. Use the plan's own description of each rule.
- The deployment in PRD §24 ("Granian serves the API and the frontend's static files", single process) is superseded by plan §5.24.1: supervised Granian and `svelte-adapter-bun` Bun processes behind an in-image reverse proxy, plus bundled PostgreSQL unless `DATABASE_URL` is set.

## Shared rules and Comradarr overrides

- `.agents/rules/python-3_14-litestar-api.md`: Litestar/Granian/msgspec/uv/ruff/basedpyright conventions. Read it before writing backend Python.
- `.agents/rules/svelte5-sveltekit-app.md`: Svelte 5 runes/SvelteKit/Bun/UnoCSS/Biome conventions. Read it before writing frontend code.
- Both files are shared copies from `edbfi/agent-rules`. Keep them byte-identical and record Comradarr exceptions here, not in those files.

Where a shared rule's generic recipe conflicts with the Comradarr plan, the plan wins:

| Topic | Shared rule recipe | Comradarr (use this) |
| --- | --- | --- |
| Backend layout | illustrative `domain/`, `controllers/` | concern-flat `comradarr/api/controllers/`, `services/<subsystem>/`, `repositories/`, `connectors/`, `db/{base,models}.py` under `backend/src/` (plan §3.1) |
| Repositories | Advanced Alchemy repository/service classes | hand-written `comradarr/repositories/` with 2.0-style `select()` (plan §5.2.4) |
| Serving | `GranianPlugin` + `litestar run` | direct `granian --interface asgi ... --workers 1 --loop uvloop` (plan §5.1.7) |
| Async tests | pytest + anyio | pytest-asyncio (auto mode) + pytest-xdist (PRD §4) |
| Dev dependencies | `[dependency-groups]` | same; ignore the plan's older `[tool.uv] dev-dependencies` (plan §3.1) |
| OpenAPI spec | `/schema` | `/api/schema/openapi.json`, via `OPENAPI_URL` in `frontend/scripts/openapi-url.ts` (plan §3.1) |
| SvelteKit adapter | `@sveltejs/adapter-node` | `svelte-adapter-bun` (plan §5.0.3, §5.24.1) |
| UnoCSS preset | `presetWind3` via `unocss-preset-shadcn/v3` | `presetWind4` + `unocss-preset-shadcn` (plan §5.0.3, PRD §4) |
| shadcn-svelte | `components.json` + empty `tailwind.config.js` + CLI `add` | neither file; vendor components by hand; theme from `frontend/themes/northern-lights.json` into `src/app.css` (plan §3.1) |
| Versions | msgspec 0.21, Bun 1.4 | plan says msgspec 0.20, Bun 1.3.x. Reconcile explicitly with the user; don't silently adopt the rule's versions |
