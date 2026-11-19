---
version: 1
slug: "route-audit"
primary_target: "route:/audit"
related_targets: []
---

# Comradarr Audit and error inspection

## Status

Proposed design seed for review. Mode: **operate**. Audience: **Admin**. Proposed route: `/audit`.

## Purpose and composition

Compact filtered audit table with event detail drawer, clear event severities and redacted context. Violet links, green success, amber attention.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Audit log'. Date range, Event, Connector filters. Rows Connector paused / Notification tested / Sign-in succeeded / Connector test failed. Detail 'Sonarr Main rejected the API key. Replace it in connector settings.' Stored key •••• 4821, correlation code demo-7a2c. 'Open connector settings', Export audit log.

## Acceptance criteria

No stack trace or secret. Errors explain recovery. Red only for error/destructive, not Missing tier by default. Event identity not public user data.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
