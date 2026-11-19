---
version: 1
slug: "route-connectors"
primary_target: "route:/connectors"
related_targets: []
---

# Comradarr Connector administration

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Admin**. Proposed route: `/connectors`.

## Purpose and composition

Connector cards reduced to compact rows with health badges, selected Sonarr details, sync controls and one read-only budget block. Same shared shell.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Connected libraries'. Sonarr Main Healthy, Radarr Movies Healthy, Prowlarr Healthy. 'Add connector'. Selected Sonarr Main: Last sync 2 min ago, 142,820 episodes. 'Sync now', 'Test connection', 'Pause connector'. Inherited limit 500; Safety reserve 20% / 100; Effective allowance 400; Used 126; Available 274.

## Acceptance criteria

No editable indexer limit. Operator may tune per-connector command limits but not upstream indexer budget. No unsupported provider names.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Prowlarr supplies indexer health and limits only. Episode commands go to Sonarr; movie commands go to Radarr.
- Show the budget as upstream 500, reserve 100, effective 400, used 126 and available 274, with the reserve outside the effective allowance.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

The sidebar becomes a closed drawer with a labelled menu button. Same restrained aurora header. Large touch controls. No squeezed desktop table, no consumer player, no queue. Budget arithmetic matches desktop.

Required content: Sonarr Main Healthy, Sync now, inherited budget read-only.

## Operational states

Each of these is its own state of this route, not one screen.

- Sync in progress: 'Syncing Sonarr Main… 42%'.
- Connector key error: 'API key rejected. Replace the key in connector settings.' Reconfigure.

Status icons plus text.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
