# Sonarr: how it behaves, as the legacy app found it

From the previous app's spec, not re-verified. Each fact moves into `sonarr-provider`'s spec, which
checks it against Sonarr's latest stable release (D23), and this file is deleted once none is left.

- Sonarr v4 serves the v3 API, as Sonarr v3 did.
- The API key goes in a request header.
- The series list carries per-season statistics: monitored, episode count, file count, total
  episode count and size on disk. A series' status is continuing, ended, upcoming or deleted.
- Episodes are read per series: one call per series, which took 30 to 60 seconds for 500 series.
- Three searches, with very different indexer cost: an episode search (a list of episode ids) costs
  one indexer query per episode; a season search (a series and a season) costs one query for the
  whole season; a series search (a series id) costs one query for the whole series.
- A command returns an id, and its status is one of queued, started, completed, failed, aborted,
  cancelled or orphaned.
- Every search Sonarr runs queries every indexer serving it, so five concurrent searches query each
  indexer five times at once.
