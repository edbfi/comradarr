---
version: 1
slug: "route-dashboard"
primary_target: "route:/dashboard"
related_targets: []
---

# Comradarr Rotation overview

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator admin**. Proposed route: `/dashboard`.

## Purpose and composition

Roomy Aurora Observatory dashboard with sidebar, thin coverage metric strip, throughput chart and connector list. No aurora image behind data.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Watching for better releases'. Rotation active. 148,240 items; 1,284 items covered today; 126 commands today. Missing 2,416; Recent 12,803; Monitored 74,221; Completed 58,800. Effective allowance 400, used 126, available 274. Separate read-only limit 500, reserve 100. Sonarr Main, Radarr Movies, Prowlarr Healthy.

## Acceptance criteria

Tier counts sum 148,240. Commands distinct from items covered. Completed caption Older items, still rotating. No 'found downloads' reporting.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- For charts, commands and covered items are separate series. Don't draw an hourly rate as a cumulative-looking curve. Demo throughput must reconcile with the fixture totals.
- Prowlarr supplies indexer health and limits only. Episode commands go to Sonarr; movie commands go to Radarr.
- Show the budget as upstream 500, reserve 100, effective 400, used 126 and available 274, with the reserve outside the effective allowance.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

The sidebar becomes a closed drawer with a labelled menu button. Same restrained aurora header. Large touch controls. No squeezed desktop table, no consumer player, no queue. Budget arithmetic matches desktop.

Required content: Rotation active, 126 commands, 1,284 covered, 274 available of 400 effective, reserve 100 shown separately.

## Operational states

Each of these is its own state of this route, not one screen.

- No connectors: 'Connect your first library.' Add connector. The global no-connector empty state is actionable.
- Rotation tiers: labels Missing, Recent, Monitored, Completed, each always in rotation.

No overall rotation completion. Status icons plus text. Focus ring violet-blue.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
