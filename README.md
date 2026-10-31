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

## Master key

Comradarr encrypts the secrets it stores with a master key you keep, and won't start without a
valid one. Which key you set depends on one question: has Comradarr run here before?

- **First install:** generate a key with `openssl rand -base64 32`, and keep a copy.
- **Existing install:** set the key it ran with, exactly as you saved it. Never generate a new key
  to get past a key error: Comradarr would start, but every secret it stored would be unreadable.

Set exactly one of these variables:

| Variable | Holds |
| --- | --- |
| `COMRADARR_SECRET_KEY` | the key itself |
| `COMRADARR_SECRET_KEY_FILE` | the path of a file holding the key, such as a Docker or Compose secret |

In the environment or a `.env` file:

```sh
COMRADARR_SECRET_KEY=paste-your-key-here
```

As a Compose secret, for a first install created with
`(umask 077; openssl rand -base64 32 > comradarr_key.txt)`:

```yaml
services:
  comradarr:
    environment:
      COMRADARR_SECRET_KEY_FILE: /run/secrets/comradarr_key
    secrets:
      - comradarr_key
secrets:
  comradarr_key:
    file: ./comradarr_key.txt
```

- A key is 44 characters ending in `=`, with no quotes or spaces around it. A key file may end in
  one newline.
- An empty variable counts as unset: `COMRADARR_SECRET_KEY=` is the same as leaving it out.

**If Comradarr won't start,** its error names the variable and what's wrong:
- *No key is set:* on an existing install, the variable went missing in an upgrade or a Compose
  change. Set your key again.
- *The key is refused:* on a first install, generate one as the error says. On an existing install,
  the key changed on its way in. Look for a stray space, a missing character or quotes kept around
  it, and set it exactly as you saved it.

**Changing the key:** Comradarr can't move stored secrets to a new key. After a change, each stored
secret fails with an error saying it was written under another master key. Enter it again, or set
the old key back, which still reads everything.

**Backups:** back up Comradarr's database with `pg_dump`, keep a copy of the key with your
backups, apart from the database, and restore the database with the key it was written with.
Without it, stored secrets can't be read. The key also derives the passwords of the database
roles Comradarr creates; it sets those again when it starts, so they need no backup of their own.

## Working on it

Start with [AGENTS.md](AGENTS.md): the house rules, the workflow and where each document lives.
The product and design context is in [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and
[docs/](docs/).
