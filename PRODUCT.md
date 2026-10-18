# Comradarr product context

Calm perpetual search rotation for Sonarr/Radarr, maximizing item coverage within inherited indexer budgets.

## Platform

web

## Users

Sidebar Dashboard, Content, Rotation, Connectors, Notifications, Audit log, Settings. Slow heartbeat beside wordmark concept, static in raster. v1 all signed-in users admins; operator/admin screen labels denote task focus, not invented user permissions.

## Primary tasks

- **Operator:** Sign-in and first connector setup. Proposed route: `/login → /setup`.
- **Operator admin:** Rotation overview. Proposed route: `/dashboard`.
- **Operator:** Content inspection and item controls. Proposed route: `/content/northbound-s02e04`.
- **Operator:** Rotation and coverage history. Proposed route: `/rotation`.
- **Admin:** Connector administration. Proposed route: `/connectors`.
- **Admin:** Rotation limits and notification routing. Proposed route: `/settings/rotation`.
- **Admin:** Access verification and preferences. Proposed route: `/settings/access`.
- **Admin:** Audit and error inspection. Proposed route: `/audit`.

## Product requirements

- Rotation never finishes and is never a queue. Missing, Recent, Monitored, Completed all remain in rotation.
- Comradarr sends search commands only, does not download or inspect download queues. No artwork/poster library.
- Supported connectors Sonarr, Radarr, optional Prowlarr only. Indexer limits inherited read-only.
- Use example limit 500, 20% reserve 100, effective budget 400; 126 used plus 274 available equals effective 400. Label reserve outside effective budget.
- Test network changes before commit. Stored secrets never revealed. Global no-connector empty state actionable.

## Confirmed visual direction

Aurora Observatory. Deep arctic navy and calm aurora green with violet-blue information. Selected board's gentle aurora heading translated into restrained heading wash; actual tables and forms flat. Humanist labels, mono numerals. No radar scope, no poster art. The selected direction is confirmed; these expanded layouts and exact token values are a proposed design seed for review.

## Accessibility and inclusion

Keyboard access throughout, visible focus, labelled inputs, text plus icon for status, 44px touch targets, readable text at 200% zoom, and reduced-motion alternatives. Target WCAG AA text contrast. Never use color alone to communicate a decision. Bundle fonts locally in the implementation.

## Product source and rewrite proposals

Read [the legacy product specification](docs/product/legacy-spec.md) for domain behavior and current gaps. Routes in this handoff describe proposed information architecture, not implemented endpoints.

This application is a planned rewrite. All v1 signed-in users are admins; operator and admin labels describe task emphasis, not new roles.
