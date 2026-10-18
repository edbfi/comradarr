---
version: 1
slug: "route-rotation"
primary_target: "route:/rotation"
related_targets: []
---

# Comradarr Rotation and coverage history

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Operator**. Proposed route: `/rotation`.

## Purpose and composition

Four compact tier lanes by last-searched age, active search panel and plain command-history table. No completion gauge.

## Visual reference

[Detailed mockup](../../docs/design/screens/04-rotation-timeline.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Every item gets another look.' Missing / Recent / Monitored / Completed lanes. Active command Northbound Season 2, covers 8 episodes. History command / items covered / time. Rotation active. 126 commands today, 1,284 items covered. Pause rotation control.

## Acceptance criteria

Completed remains rotating. Do not show queue depth, exhausted state, overall percent complete or time until product is finished.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Operational states

[States and components board](../../docs/design/screens/10-states-and-components.webp), separate specimens; each is its own state of this route, not one screen.

- Paused rotation: 'Rotation paused.' Resume rotation.
- Daily allowance reached: 'Daily allowance reached. Rotation resumes tomorrow.' View budget. This is a temporary daily budget pause, never an exhausted library.

No overall rotation completion. Status icons plus text.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- For charts, commands and covered items are separate series. Avoid copying a cumulative-looking curve as an hourly rate. Demo throughput must reconcile with the fixture totals.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
