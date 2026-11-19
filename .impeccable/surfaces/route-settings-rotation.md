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

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Required content

'Rotation settings'. Local daily command cap 400, concurrency 2, minimum interval 30 seconds. Inherited effective allowance 400 shown read-only and clear. 'Save rotation settings'. Notification destination Homelab email, Test notification. Matrix Connector unhealthy ON, Budget paused ON, Sync complete OFF. 'Save notification routes'.

## Acceptance criteria

Local cap may not exceed safe effective budget; inherited limit remains non-editable. No 'queue' labels. No raw email or secret endpoints shown.

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- A notification destination is a configured named channel such as Homelab email; there is no in-app delivery channel or notification centre.
- Show the budget as upstream 500, reserve 100, effective 400, used 126 and available 274, with the reserve outside the effective allowance.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only this surface in Comradarr's existing application. Read PRODUCT.md, DESIGN.md and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
