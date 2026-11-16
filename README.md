<p align="center">
  <img src="static/comradarr-icon.svg" alt="comradarr logo" width="160">
</p>
<h1 align="center">comradarr</h1>
<p align="center"><strong>Continuous search rotation for Sonarr and Radarr within indexer budgets</strong></p>
<p align="center">
  <a href="https://github.com/edbfi/comradarr/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0--or--later-blue?style=flat" alt="License: AGPL-3.0-or-later"></a>
  <a href="https://github.com/oven-sh/bun"><img src="https://img.shields.io/badge/Bun-000000?style=flat&amp;logo=bun&amp;logoColor=white" alt="Bun"></a>
  <a href="https://github.com/sveltejs/kit"><img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&amp;logo=svelte&amp;logoColor=white" alt="SvelteKit"></a>
  <a href="https://github.com/microsoft/TypeScript"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&amp;logo=typescript&amp;logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/edbfi/comradarr/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/edbfi/comradarr/ci.yml?branch=main&amp;event=push&amp;label=CI&amp;style=flat" alt="CI"></a>
</p>

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

## Database

Comradarr keeps its data in PostgreSQL 16 or later, run as its own service: a container next to
Comradarr, or a server you already have. Give Comradarr one database and a role that owns it and
may create roles; at every start Comradarr migrates that database with it.

Set exactly one of these variables, as for the master key:

| Variable | Holds |
| --- | --- |
| `COMRADARR_DATABASE_URL` | the owner role's URL, such as `postgres://comradarr:<password>@db:5432/comradarr` |
| `COMRADARR_DATABASE_URL_FILE` | the path of a file holding that URL, such as a Docker or Compose secret |

The URL is a secret: Comradarr never prints the URL or its password; its errors name the variable
and PostgreSQL's reason.

**The roles Comradarr creates.** At every start, before it serves anything, Comradarr checks that
the owner role can do its job (it names anything missing), migrates, and sets up two roles of its
own, named after the database: `<database>_app`, which every request uses, and
`<database>_audit_admin`, for clearing old audit entries. Their passwords come from the master key,
so there is nothing to store: a new key sets new passwords at the next start. If your server's
`pg_hba.conf` lists the users it lets in, allow these two from Comradarr's address, as the owner
role; otherwise Comradarr stops, naming the role PostgreSQL refused. When
PostgreSQL is still starting, Comradarr waits for it for up to 30 seconds before it gives up.

## Health

`/healthz` answers without signing in, for a container's health check: `{"status":"healthy",
"components":{"database":"healthy"}}` with 200, or `unavailable` with 503 when the database fails
or doesn't answer within 2 seconds. It never shows versions, timings or errors: the log says why,
once when the database becomes unavailable and once when it is back.

## Stopping and the server's limits

Comradarr stops cleanly on `SIGTERM`, `SIGINT` or `SIGHUP`: it lets the requests in progress finish,
for up to `SHUTDOWN_TIMEOUT` seconds, closes its database connections, and exits. These variables
belong to the Bun server it runs on:

| Variable | Holds | Default |
| --- | --- | --- |
| `SHUTDOWN_TIMEOUT` | seconds to let requests finish when stopping | `30` |
| `CONNECTION_IDLE_TIMEOUT` | seconds before an idle connection closes, at most 255 | `10` |
| `BODY_SIZE_LIMIT` | the largest request body accepted | `512K` |

After the requests finish, Comradarr takes a little over 5 more seconds at most to close. Give the container
longer than `SHUTDOWN_TIMEOUT` plus 5 seconds to stop, or it's killed mid-write. Docker's default is
10 seconds, so with the default `SHUTDOWN_TIMEOUT`, set Compose's `stop_grace_period` to `40s`.

## Logs

Comradarr writes its log to standard output, one JSON object per line, which the container
runtime collects. Each entry has a time, a level, a source, a message and its details, and an entry
written while answering a request carries that request's id. Passwords, tokens, keys, cookies and
anything shaped like them are replaced with `[redacted]` before an entry is written. To send debug
entries with a bug report, set `COMRADARR_LOG_DEBUG=true` (`true` or `false`, off by default).

## Working on it

Start with [AGENTS.md](AGENTS.md): the house rules, the workflow and where each document lives.
The product and design context is in [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and
[docs/](docs/).

The tests need a PostgreSQL: they start a throwaway one with Docker, or use the server
`COMRADARR_TEST_DATABASE_URL` names (a role that may create databases and roles). To run the app
itself, a local PostgreSQL in Docker is enough:

```sh
docker run -d --name comradarr-db -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=comradarr -e POSTGRES_PASSWORD=comradarr postgres:18
# then in .env: COMRADARR_DATABASE_URL=postgres://comradarr:comradarr@127.0.0.1:5432/comradarr
```

## License

Comradarr's owner-original code is free software: you can redistribute it and/or modify it under
the terms of the [GNU Affero General Public License](LICENSE) as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version
(`AGPL-3.0-or-later`). Third-party code, dependencies and installed agent skills retain their
respective licenses and notices.
