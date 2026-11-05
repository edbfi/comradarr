# Prowlarr: how it behaves, as the legacy app found it

From the previous app's spec, not re-verified. Each fact moves into the spec of the module that
relies on it (`prowlarr-provider`, `indexer-budget`), checked against Prowlarr's latest stable
release (D23), and this file is deleted once none is left.

- Prowlarr serves the v1 API; the API key goes in a request header.
- The indexer list carries each indexer's query limits, hourly or daily.
- Indexer statistics (query counts, grabs and failures) cover a date range and count every source:
  RSS sync, manual searches, other tools, and Comradarr's own searches through Sonarr and Radarr.
- Indexer status says whether an indexer is disabled, since when and until when.
- The applications list and its tags say which indexers serve which Sonarr or Radarr instance
  (Prowlarr syncs indexers to applications by tag). Each application entry holds the URL Prowlarr
  uses to reach that instance, which may be a container name where Comradarr's connector uses an IP
  address, or the other way round.
