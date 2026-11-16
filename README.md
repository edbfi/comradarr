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

## Running it with Compose

There is no Comradarr image yet, so this example runs the server you build, in Bun's own image,
next to PostgreSQL 18. In a clone of this repository, build it once:

```sh
bun ci && bun run --bun build
```

Then make the three secrets, each in its own file. The database URL repeats the database password:

```sh
mkdir -p secrets
openssl rand -base64 32 > secrets/master-key
openssl rand -hex 24 > secrets/db-password
printf 'postgres://comradarr:%s@db:5432/comradarr' "$(cat secrets/db-password)" > secrets/database-url
```

Keep a copy of `secrets/master-key` with your backups. Save this as `compose.yaml` next to them:

```yaml
services:
  db:
    image: postgres:18
    environment:
      POSTGRES_USER: comradarr
      POSTGRES_DB: comradarr
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes:
      - db:/var/lib/postgresql
    healthcheck:
      test: ["CMD", "pg_isready", "--username=comradarr", "--dbname=comradarr"]
      interval: 5s
      timeout: 5s
      retries: 12
    restart: unless-stopped

  comradarr:
    image: oven/bun:1.4.4
    command: ["bun", "/app/build"]
    volumes:
      - ./build:/app/build:ro
    environment:
      COMRADARR_SECRET_KEY_FILE: /run/secrets/master_key
      COMRADARR_DATABASE_URL_FILE: /run/secrets/database_url
      # ORIGIN: https://comradarr.example
    secrets: [master_key, database_url]
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
    stop_grace_period: 40s
    restart: unless-stopped

secrets:
  master_key:
    file: ./secrets/master-key
  db_password:
    file: ./secrets/db-password
  database_url:
    file: ./secrets/database-url

volumes:
  db:
```

Start it with `docker compose up -d`, and read the setup banner with `docker compose logs
comradarr` (below). Comradarr starts once PostgreSQL's health check passes, and waits for it
itself as well.

## Backups

A backup is PostgreSQL's own dump of Comradarr's database, together with the master key. Comradarr
needs both: the key derives the passwords of its two database roles and decrypts what it stores.
With the Compose example:

```sh
docker compose exec -T db pg_dump --no-owner --no-privileges --username=comradarr --dbname=comradarr > comradarr.sql
```

The dump leaves out the two roles; Comradarr creates them again at its next start. To restore,
start PostgreSQL on an empty volume, load the dump into its new database, then start Comradarr with
the same master key:

```sh
docker compose up -d db
docker compose exec -T db psql -v ON_ERROR_STOP=1 --quiet --username=comradarr --dbname=comradarr < comradarr.sql
docker compose up -d comradarr
```

Take a backup before each upgrade: migrations only go forward, so going back means restoring the
backup and running the previous version.

## First run

Until its owner claims it, Comradarr prints a setup token to its console output (`docker logs`, for
a container) when it starts:

```text
==================== Comradarr setup ====================
Setup token: abcd-1234-wxyz (valid until 2026-11-16 14:45:00 UTC)
Open /setup#token=abcd-1234-wxyz at the address you reach Comradarr at, to claim it.
This output is a setup secret: don't paste it into chats or issue trackers.
=========================================================
```

With `ORIGIN` set, the link is a full address. A token lasts 15 minutes, and a new one is printed
when it expires and at every start. Anyone who can read this output can claim a new Comradarr, so
keep it to yourself. The token appears only in this banner, never in Comradarr's JSON log entries.

Open the link, choose the owner's username and a password of 15 to 128 characters, and claim. The
page shows which password rules are met as you type; common passwords are checked when you claim.
Until then, every page sends the browser to `/setup`, and a program that asks for JSON gets a 503
`setup_incomplete`; `/healthz` still answers. Once claimed, `/setup` is gone, and no token is
printed again.

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

## The address browsers use

Comradarr asks each browser where a form or other change came from, and refuses one sent from
another site with "Access denied". So it needs no address of its own: `ORIGIN` is optional, and
tells Comradarr the address browsers use, as a bare origin with no path:

| Variable | Holds | Default |
| --- | --- | --- |
| `ORIGIN` | the address browsers use, such as `https://comradarr.example` or `http://192.168.1.20:3000` | unset |

Comradarr won't start if `ORIGIN` is empty or holds a path, a query, a fragment or credentials;
leave it out instead. Over HTTPS (when `ORIGIN` is `https`, or, without it, when the request came
over HTTPS), pages ask browsers to keep using HTTPS for a year. Browsers apply that to every port of
the host name, so an app on the same host name over plain HTTP, such as Sonarr or Radarr, becomes
unreachable from that browser: give it its own host name, or serve it over HTTPS too.

**When Comradarr refuses its own forms with "Access denied":** behind a reverse proxy that rewrites
the `Host` header, Comradarr can't match the browser's address to the one it was asked for. Set
`ORIGIN` to the address browsers use, or have the proxy pass the browser's `Host` on: in nginx,
`proxy_set_header Host $http_host;` (not `$host`, which drops a port that isn't the default). Over
plain HTTP this affects every browser; over HTTPS only older ones (Safari before 16.4, Firefox
before 90, Chrome before 76), since current browsers say where a request came from themselves.

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
