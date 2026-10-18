---
version: 1
slug: "route-settings-rotation"
primary_target: "route:/settings/rotation"
related_targets: []
---

# Comradarr Rotation limits and notification routing

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Admin**. Proposed route: `/settings/rotation`.

## Purpose and composition

Settings with two useful sections: editable local command pacing, and notification event routing matrix. Quiet fixed labels and short help.

## Visual reference

[Detailed mockup](../../docs/design/screens/06-settings-rotation-notifications.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Rotation settings'. Local daily command cap 400, concurrency 2, minimum interval 30 seconds. Inherited effective allowance 400 shown read-only and clear. 'Save rotation settings'. Notification destination Local alerts, Test notification. Matrix Connector unhealthy ON, Budget paused ON, Sync complete OFF. 'Save notification routes'.

## Acceptance criteria

Local cap may not exceed safe effective budget; inherited limit remains non-editable. No 'queue' labels. No raw email or secret endpoints shown.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Settings board 06 names a destination Local alerts and invents an in-app notification centre. Implement a configured named channel such as Homelab email; do not invent an in-app delivery channel.
- The original exploration board used a different budget presentation. This detailed seed uses upstream 500, reserve 100, effective 400, used 126, available 274; the reserve is outside the effective allowance.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
