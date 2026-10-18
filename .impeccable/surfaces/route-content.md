---
version: 1
slug: "route-content"
primary_target: "route:/content"
related_targets: []
---

# Comradarr Content inspection and item controls

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/content`, with the selected item in the URL (the handoff's example is `/content/northbound-s02e04`).

## Purpose and composition

Dense text-only content table with filter row and selected-item inspector. Compact rows, mono numeric cells, violet selection, green status.

## Visual reference

[Detailed mockup](../../docs/design/screens/03-content-and-item.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Content'. Filters All connectors / All types / All tiers. Rows Northbound S02E04 Missing no file last searched 2h ago; The Crossing S01E08 Recent file present; Silent Harbour (2024) Movie Monitored. Inspector Northbound, Season 2 Episode 4, 12 searches, Missing. 'Search now', 'Pause item'.

## Acceptance criteria

No movie marked episode. Pausing item distinct from entire rotation. No artwork, playback button or download action. Filtering state shareable.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Mobile (390px)

[Mobile board](../../docs/design/screens/09-mobile-operator.webp), middle view.

Three mobile web viewports share one board: rotation summary, content item and connector details. The sidebar becomes a closed drawer with a labelled menu button. Same restrained aurora header. Large touch controls. No squeezed desktop table, no consumer player, no queue. Budget arithmetic matches desktop.

Required content: Northbound S02E04, Missing, Search now, Pause item.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Prowlarr supplies indexer health and limits only. Episode commands go to Sonarr; movie commands go to Radarr.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
