# Radarr: how it behaves, as the legacy app found it

From the previous app's spec, not re-verified. Each fact moves into the spec of the module that relies
on it (`radarr-provider`, `sync`, `rotation`), checked against Radarr's latest stable release (D23),
and this file is deleted once none is left.

- Radarr serves the v3 API; the API key goes in a request header.
- Every movie comes in a single call; there is no per-movie read like Sonarr's per-series episodes.
- A movie's status is announced, in cinemas, released, deleted or similar.
- Radarr has no grouping: each movie is one indexer query. One search command takes a list of movie
  ids.
- A command returns an id, and its status is one of queued, started, completed, failed, aborted,
  cancelled or orphaned.
