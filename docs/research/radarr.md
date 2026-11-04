# Radarr: how it behaves, as the legacy app found it

From the previous app's spec, not re-verified. Each fact moves into `radarr-provider`'s spec, which
checks it against Radarr's latest stable release (D23), and this file is deleted once none is left.

- Radarr serves the v3 API; the API key goes in a request header.
- The whole movie list comes in a single call, so reading every movie costs the same as reading the
  list.
- A movie's status is announced, in cinemas, released, deleted or similar.
- Radarr has no grouping: each movie is one indexer query. One search command takes a list of movie
  ids.
- A command returns an id, and its status is one of queued, started, completed, failed, aborted,
  cancelled or orphaned.
