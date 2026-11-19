---
version: 1
slug: "route-setup"
primary_target: "route:/setup"
related_targets: []
---

# Comradarr First-run setup

## Status

Proposed design seed for review. Mode: **operate**. Audience: **the person installing Comradarr** (claim step), then the **Operator** (later steps). Route: `/setup`, which serves every first-run step. Steps: Claim and account (`setup`, [docs/SPEC-setup.md](../../docs/SPEC-setup.md)), Two-factor (`two-factor`), Verify access (`http-boundary`) and Connect (`connectors`). This brief covers the claim step and the Connect step; the Two-factor and Verify access steps get their own sections before their modules are specced.

## Purpose and composition

First run, before and after the installation is claimed, with a soft aurora wash confined to the top banner. No consumer landing or public account signup, and no sidebar or app navigation: the header has only the Comradarr logo and wordmark and the language switcher (`LanguageSwitcher.svelte`). The step list (Claim and account / Two-factor / Verify access / Connect) shows the current step and can't be clicked; it appears once first run has more than one step, from `two-factor` on. Until then the claim is first run's only step. Sign-in (`/login`) is a separate route.

## Visual reference

Use the shared [design system](../../DESIGN.md) and build real semantic components.

## Claim and account step

**Required content.** Heading 'Claim this Comradarr'. One line: 'Enter the setup token printed in the server console, then create the owner account.' Fields: 'Setup token' (helper: 'Shown as xxxx-xxxx-xxxx. A new one is printed every 15 minutes.'), 'Username', 'Password' (helper: 'At least 15 characters.', with a control that shows what was typed). Below the password, the rules it already meets, updated as the person types: at least 15 characters (with the count so far), not a repeat or a straight run, without 'Comradarr' or the username. Primary action 'Claim and create owner'. While submitting: 'Claiming…', and the button can't be pressed twice.

**Acceptance criteria.**
- The token arrives filled in when the person opens the console's link (its `#token=` fragment), and the address bar shows `/setup` at once; it can always be typed or pasted, with or without dashes and in any case. It is not a password field, so the person can check what they typed.
- After a failed submit the title starts with 'Error: ', and the error summary (D26) is first in the form: 'There is a problem', then the problems in field order, each field's linking to it, a page-level one as text. Field errors also sit beside their field with helper/error IDs and `aria-invalid`. With JavaScript, focus moves to the summary after each failure; without it, nothing is focused. A wrong or expired token gets one message that names the console, never which of the two it was. A common password is refused on submit, beside the password.
- The rules list is announced politely, never as an error, and says what is met, not a score: no strength bar or colour that could call a refused password strong.
- After a failed submit, the username is kept; the token and password are not.
- No connector, server or network detail appears. No secrets in text.
- Works without JavaScript: no Show control, no live rules list, and the token is typed.
- States: initial, token filled from the link, field errors, token refused, common password refused, failed, submitting. After success the browser leaves the page.

## Direction contract

Claim and account step, development only.

- **THESIS:** the claim is a quiet operator form, not a welcome screen. The token reads like the console line it came from, and the password shows the rules it meets, never a score.
- **OWN-WORLD:** Aurora Observatory as DESIGN.md has it. The navy ground and one flat `surface` panel with a 1px `border`. One solid `primary` action. `secondary` only for the focus ring. The aurora appears only as the banner's static green and violet wash.
- **STORY:** the installer opens the console's link, finds the token already filled in, picks a username and a password while the rules tick over, and claims. A refusal says what to fix beside the field.
- **FIRST VIEWPORT:** a 64px banner with the logo, the wordmark and the language switcher. Below it, the panel in the 672px form width: `h1`, one intro line, then token, username and password. The rules list sits below the password, and the full-width primary button comes last.
- **FORM:** the brief's own composition (flat panel, labelled fields, one primary button), first and only, pinned by this brief. seed: none (pinned)
- **SIGNATURE:** the live rules list, with a drawn check or circle plus text for each rule, announced politely only when a rule changes.

## Connect step

**Required content.** 'Connect your media library', type Sonarr selected, name Sonarr Main, address https://sonarr.example, API key masked, Test connection, status Connection verified, Save connector.

**Acceptance criteria.** Shown after the Claim and account, Two-factor and Verify access steps, never as open unclaimed admin signup. No secrets in text.

## Acceptance criteria for every step

- Preserve audience boundaries from [product context](../../PRODUCT.md).
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json).
- Prowlarr supplies indexer health and limits only. Episode commands go to Sonarr; movie commands go to Radarr.
- Show the budget as upstream 500, reserve 100, effective 400, used 126 and available 274, with the reserve outside the effective allowance.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Handoff prompt

> Implement only the step your module builds, in Comradarr's existing application. Read PRODUCT.md, DESIGN.md, the module's spec and this brief first. Use the named tokens as exact values. Preserve Aurora Observatory: the aurora wash stays in the top banner, and the forms stay flat and quiet. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states.
