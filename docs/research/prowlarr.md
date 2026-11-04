# Prowlarr: how it behaves, as the legacy app found it

From the previous app's spec, not re-verified. Each fact moves into `prowlarr-provider`'s spec,
which checks it against Prowlarr's latest stable release (D23), and this file is deleted once none
is left.

- Prowlarr serves the v1 API; the API key goes in a request header.
- The indexer list carries each indexer's query limits, hourly or daily. Hourly-limited indexers
  have burst limits that daily-limited ones don't.
- Indexer statistics (query counts, grabs and failures) cover a date range and count every source:
  RSS sync, manual searches, other tools, and Comradarr's own searches through Sonarr and Radarr.
- Indexer status says whether an indexer is disabled, since when and until when.
- The applications list and its tags say which indexers serve which Sonarr or Radarr instance
  (Prowlarr syncs indexers to applications by tag). An application is named by the URL Prowlarr
  uses for it, which may be a container name where Comradarr uses an IP address, or the other way
  round.
