<div align="center">
  <img src="static/comradarr-icon.svg" alt="Comradarr Icon" width="240" height="240" />

# Comradarr (WIP)

[![License](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

</div>

> [!IMPORTANT]
> **Rewrite in progress.** Comradarr is being rebuilt from scratch, and `main` is now the
> starting point for the new version. The previous version is preserved on the
> [`legacy-old/v1`](https://github.com/edbfi/comradarr/tree/legacy-old/v1) branch.
> The partial implementation remains on the [`feat/comradarr-implementation-plan`](https://github.com/edbfi/comradarr/tree/feat/comradarr-implementation-plan) branch.

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript 6, strict type checking |
| Framework | Svelte 5 and SvelteKit 3, server rendering on one origin |
| Runtime and packages | Bun for development, CI and production |
| Database | PostgreSQL as a separate service, through Drizzle and Bun SQL |
| Styling and primitives | Panda CSS 2 and Ark UI for Svelte |
| HTTP API clients | `@hey-api/openapi-ts`, generated from the app's OpenAPI document |
| Deployment | `@sveltejs/adapter-bun`: one container, one process, one HTTP port |

## Working on it

Start with [AGENTS.md](AGENTS.md): the house rules, the workflow and where each document lives.
The product and design context is in [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and
[docs/](docs/).
