---
version: 1
slug: "route-settings-access"
primary_target: "route:/settings/access"
related_targets: []
---

# Comradarr Access verification and preferences

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Admin**. Proposed route: `/settings/access`.

## Purpose and composition

Structured network verification form with four clearly named progression states, secondary preference form and session panel. No visual noise.

## Visual reference

[Detailed mockup](../../docs/design/screens/07-settings-access-preferences.webp)

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Required content

'Public access'. Observed https://rotate.example, Proposed https://rotate.example. Steps Observed / Proposed / Testing / Verified. 'Test address' and disabled 'Save address' until Verified. Preferences Appearance Dark / Light / System, Language English, Timezone Europe/Berlin. 'Save preferences'. Sessions Current browser, Revoke other sessions.

## Acceptance criteria

Show testing example as one state only; save disabled during Testing. No save success before proven verification. Stored connector keys never shown.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Address verification proves the current browser configuration. No internet accessibility requirement; private LAN deployments remain supported.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the attached detailed image as a composition reference and the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
