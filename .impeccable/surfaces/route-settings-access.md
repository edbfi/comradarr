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

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Public access'. Observed https://rotate.example, Proposed https://rotate.example. Steps Observed / Proposed / Testing / Verified. 'Test address'. The address is only checked, never saved: when it doesn't match, the result suggests adding the proxy line `proxy_set_header Host $http_host`, or setting `ORIGIN=<address>` (or fixing or removing a wrong `ORIGIN`) and restarting. Preferences Appearance Dark / Light / System, Language English, Timezone Europe/Berlin. 'Save preferences'. Sessions Current browser, Revoke other sessions.

## Acceptance criteria

Show testing example as one state only. Verified reports the check's result, not a saved value. Stored connector keys never shown.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Address verification proves the current browser configuration. No internet accessibility requirement; private LAN deployments remain supported.
- Public access saves no address: no 'Save address' button, and no step caption or subtitle that speaks of saving it.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
