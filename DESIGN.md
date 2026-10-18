---
version: alpha
name: "Comradarr Aurora Observatory"
description: "Proposed design seed for review; not extracted from implemented components."
colors:
  background: "#101C35"
  surface: "#1C2E4C"
  raised: "#293F60"
  border: "#4B6486"
  control-border: "#7A8CA5"
  primary: "#79E5BE"
  secondary: "#9C9AFA"
  text: "#EAF0FF"
  muted: "#B4C7E3"
  success: "#79E5BE"
  warning: "#F0CC83"
  danger: "#FFACB5"
typography:
  display:
    fontFamily: "Source Sans 3"
    fontSize: "56px"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  h1:
    fontFamily: "Source Sans 3"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  h2:
    fontFamily: "Source Sans 3"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  h3:
    fontFamily: "Source Sans 3"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Source Sans 3"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Source Sans 3"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  table:
    fontFamily: "Source Sans 3"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Source Sans 3"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  number:
    fontFamily: "IBM Plex Mono"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: 1.2
  code:
    fontFamily: "IBM Plex Mono"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  control: "8px"
  panel: "12px"
  dialog: "16px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
  section: "48px"
  hero: "64px"
components:
  primary-button:
    background: "{colors.primary}"
    foreground: "{colors.background}"
    radius: "{rounded.control}"
    height: "44px"
  text-field:
    background: "{colors.surface}"
    foreground: "{colors.text}"
    border: "{colors.control-border}"
    focus: "{colors.secondary}"
---
# Comradarr design seed

## Overview

Aurora Observatory. Deep arctic navy and calm aurora green with violet-blue information. Selected board's gentle aurora heading translated into restrained heading wash; actual tables and forms flat. Humanist labels, mono numerals. No radar scope, no poster art.

Use this as a proposed implementation target. The chosen direction comes from the selected references; tokens and expanded screens remain reviewable design decisions. [Product context](PRODUCT.md) and the [surface briefs](.impeccable/surfaces/) define behavior; each brief also records the raster corrections that resolve incidental image text. Generated raster pixels are visual guidance; they do not override named tokens or product requirements.

## Colors

- **background:** `#101C35`.
- **surface:** `#1C2E4C`.
- **raised:** `#293F60`.
- **border:** `#4B6486`.
- **control-border:** `#7A8CA5`; use for field/control boundaries. The quieter border token is decorative panel separation.
- **primary:** `#79E5BE`.
- **secondary:** `#9C9AFA`.
- **text:** `#EAF0FF`.
- **muted:** `#B4C7E3`.
- **success:** `#79E5BE`.
- **warning:** `#F0CC83`.
- **danger:** `#FFACB5`.

Primary fills use background-colored text. Secondary color marks information, links and keyboard focus. Success, warning and danger have fixed semantic roles; danger is for failures and destructive action. Use subdued tinted backgrounds for badges, with readable semantic text. Chart series get text labels and markers. Do not put imagery behind data, text fields or tables. Comradarr's Missing tier is a library classification, not a destructive failure.

## Typography

- **display:** Source Sans 3, 56px/1.08, weight 650, tracking -0.03em.
- **h1:** Source Sans 3, 32px/1.2, weight 600, tracking -0.02em.
- **h2:** Source Sans 3, 24px/1.3, weight 600.
- **h3:** Source Sans 3, 20px/1.4, weight 600.
- **body:** Source Sans 3, 16px/1.6, weight 400.
- **label:** Source Sans 3, 14px/1.4, weight 600.
- **table:** Source Sans 3, 14px/1.45, weight 400.
- **caption:** Source Sans 3, 12px/1.5, weight 400.
- **number:** IBM Plex Mono, 32px/1.2, weight 500.
- **code:** IBM Plex Mono, 13px/1.5, weight 400.

Keep prose below 70 characters per line. Titles use sentence case. Keep capitals for proper names and short codes. Operational numbers use tabular mono glyphs. Font names indicate intended typefaces; image generation approximates glyphs. Use locally bundled font files and fallbacks, rather than remote font requests.

## Layout

A 12-column desktop content grid has 24px gaps and 32px outer gutters. Desktop navigation is 224px wide, top bar 64px. At 1024px collapse navigation to a rail; below 768px use an accessible drawer. Mobile gutters are 16px. Main forms max out at 672px and reading/wizard content at 680px. Operational pages can span 1440px. A detail drawer is 400px on desktop and full width on mobile.

Use spacing tokens 4, 8, 12, 16, 24, 32, 48 and 64px. Group labels with fields, use 24px between form groups and 48px between major sections. Keep one dominant action per task area. Composite boards show alternatives or sequential routes together for review; do not combine them into one implementation screen.

## Elevation & Depth

Flat surfaces and a 1px border carry most hierarchy. Reserve a broad soft shadow and 48% dark scrim for a modal or floating detail sheet. No repeated card drop shadows or glowing operational status dots. Public imagery may be covered with a dark readability overlay; operational surfaces remain opaque.

Motion defaults: 100ms press feedback, 160ms status feedback, 200ms sheet transitions. Avoid scale/count-up on operational metrics. Respect reduced motion by showing final content immediately. One slow wordmark heartbeat is allowed only while dispatching; it stops when idle/paused.

## Shapes

Controls use 8px corners, panels 12px, dialogs 16px. Use pill radius only for small statuses or segmented choices. Icons are a single consistent 20px line family with 1.5–2px stroke. Do not reproduce generated connector logos as assets; use the approved real integration marks or labelled generic icons.

## Components

Inputs have visible labels; use helper/error IDs and aria-invalid on failure. A password field may reveal only newly typed input; a stored service secret is a noninteractive stored-state receipt plus a blank replacement field.

Use a solid primary button, bordered secondary button, ghost navigation action and danger button for destructive confirmation. Disabled controls remain visibly labelled and expose disabled state. During saving, use a verb such as Saving… and prevent duplicate requests. Do not announce success before durable completion.

Dialogs trap focus, close on Escape when safe and restore focus to the triggering control. Give every icon button an accessible name. Use a 2px secondary-color focus ring with 2px offset. Status badges always combine icon and text. Keep toasts out of the pointer path and announce copy/save results through a polite live region.

Tables use 44px standard rows, 36px only for dense desktop operation, 14px labels and monospaced numeric cells. Sort, filter, search and page state should survive navigation. Mobile turns records into labelled stacked rows and opens details as a full-width route or sheet. A fixed primary action must not cover content or a focused field.

## Do’s and Don’ts

- Preserve this app's palette and type hierarchy across every route; do not blend the five applications into one theme.
- Keep welcome/experience screens expressive and operational controls quiet.
- Treat product permissions, status transitions and budget arithmetic as behavior supplied by the server.
- Use [demo fixtures](tests/fixtures/demo-fixtures.json) for stable visual tests, then substitute real server data.
- Follow each surface brief's raster corrections instead of copying accidental generated labels or extra actions.
- Use existing project primitives and tokens. This repository's rewrite stack specifies Panda CSS and Ark UI; map these values into those systems without adding a competing component library.
