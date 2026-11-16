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

First run, before and after the installation is claimed, with a soft aurora wash confined to the top banner. No consumer landing or public account signup, and no sidebar or app navigation: the header has only the Comradarr logo and wordmark and the language switcher (`LanguageSwitcher.svelte`). The step list (Claim and account / Two-factor / Verify access / Connect) shows the current step and can't be clicked; it appears once first run has more than one step, from `two-factor` on. Until then the claim is first run's only step. The same board shows sign-in (`/login`) as a separate route.

## Visual reference

[Detailed mockup](../../docs/design/screens/01-entry-and-setup.webp), right view, for the Connect step and the banner. The claim step has no mockup: a flat `surface` panel with a 1px border inside the 672px form width, `h1` heading, labelled fields with helper text, one solid primary button.

Use the shared [design system](../../DESIGN.md). Match hierarchy, density and palette while building real semantic components. This is a screen composition; any side-by-side stages are separate routes or states.

## Claim and account step

**Required content.** Heading 'Claim this Comradarr'. One line: 'Enter the setup token printed in the server console, then create the owner account.' Fields: 'Setup token' (helper: 'Shown as xxxx-xxxx-xxxx. A new one is printed every 15 minutes.'), 'Username', 'Password' (helper: 'At least 15 characters.', with a control that shows what was typed). Below the password, the rules it already meets, updated as the person types: at least 15 characters (with the count so far), not a repeat or a straight run, without 'Comradarr' or the username. Primary action 'Claim and create owner'. While submitting: 'Claiming…', and the button can't be pressed twice.

**Acceptance criteria.**
- The token arrives filled in when the person opens the console's link (its `#token=` fragment), and the address bar shows `/setup` at once; it can always be typed or pasted, with or without dashes and in any case. It is not a password field, so the person can check what they typed.
- Errors sit beside their field with helper/error IDs and `aria-invalid`; a wrong or expired token gets one message that names the console, never which of the two it was. A common password is refused on submit, beside the password.
- The rules list is announced politely, never as an error, and says what is met, not a score: no strength bar or colour that could call a refused password strong.
- After a failed submit, the username is kept; the token and password are not, and focus goes to the token field after a server failure.
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
- Use canonical data in [demo fixtures](../../tests/fixtures/demo-fixtures.json); do not infer calculations from raster text.
- Apply the raster corrections below.
- Make loading, empty, failure, pending and saved states available where the workflow needs them.
- Test keyboard focus, visible labels, disabled behavior and 200% zoom; target 360, 390, 768 and 1440px viewports, in English and Danish.
- Read reduced-motion preference before animating. Long names and translated text must wrap without hiding the primary action.

## Raster corrections

Use the images for composition and visual character. Use DESIGN.md, PRODUCT.md, this brief's acceptance criteria and the demo fixtures for exact values and behavior. Body copy, chart axes, tiny icons and font glyphs remain illustrative raster renderings. Rebuild them as native accessible UI and verify them against the specification. A PNG cannot verify focus order, screen-reader announcements, permission checks or real responsiveness.

- Entry board 01 combines sign-in and post-claim connector setup for review; implement separate routes without an authenticated sidebar on sign-in.
- The raster's step list (Claim / Verify access / Account / Connect) is the old order; use the one in Purpose and composition.
- Prowlarr supplies indexer health and limits only. Episode commands go to Sonarr; movie commands go to Radarr.
- The original exploration board used a different budget presentation. This detailed seed uses upstream 500, reserve 100, effective 400, used 126, available 274; the reserve is outside the effective allowance.

## Handoff prompt

> Implement only the step your module builds, in Comradarr's existing application. Read PRODUCT.md, DESIGN.md, the module's spec and this brief first. Use the attached detailed image as a composition reference where the step has one, and the named tokens as exact values. Preserve Aurora Observatory: the aurora wash stays in the top banner, and the forms stay flat and quiet. Keep the server's domain decisions authoritative. Reuse existing Panda CSS tokens and Ark UI primitives. Build native accessible controls, then compare desktop/mobile screenshots and audit the required states. Do not add incidental actions visible only in the raster.
