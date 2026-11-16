<script lang="ts">
import { onMount, tick, untrack } from "svelte";
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { type PasswordRulesMet, passwordRules } from "#lib/shared/password-rules.ts";
import { css } from "#styled-system/css";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import type { PageProps, SubmitFunction } from "./$types";
import { deleteAcrossDash, formatTokenInput } from "./token-format.ts";

let { form }: PageProps = $props();

const NAME = "Comradarr";

let submitting = $state(false);
let showPassword = $state(false);
// The Show control and the rules list need script, so they appear only once the page has it.
let hydrated = $state(false);

/** Fields edited since the last answer: their old error no longer describes what they hold. */
let edited = $state({ token: false, username: false, password: false });
let tokenInput = $state<HTMLInputElement>();
let passwordInput = $state<HTMLInputElement>();
// The typed username, bound to its field: a failed claim's answer sends it back, and a bound value
// never gets written over by an attribute effect re-running mid-submit.
// The first answer seeds it; later ones send back what the field already holds.
let usernameValue = $state(untrack(() => form?.username ?? ""));
let passwordValue = $state("");

/**
 * The console's link carries the token in its fragment, which never reaches the server: fill it
 * in, then take it out of the address bar at once (SPEC-setup.md, "The link"). On load, and when a
 * link is opened in a tab already showing the page, which changes only the fragment.
 */
function takeTokenFromLink() {
	const token = new URLSearchParams(location.hash.slice(1)).get("token");
	if (token === null) return;
	goto(location.pathname + location.search, { state: {}, shallow: true, replace: true }).catch(() =>
		history.replaceState(history.state, "", location.pathname + location.search),
	);
	if (tokenInput) {
		tokenInput.value = formatTokenInput(token, token.length).value;
		edited.token = true;
	}
}

onMount(() => {
	takeTokenFromLink();
	hydrated = true;
});

const usernameMessages = {
	empty: m.setup_username_empty,
	"too-long": m.setup_username_too_long,
	control: m.setup_username_control,
};
const passwordMessages = {
	"too-short": m.setup_password_too_short,
	"too-long": m.setup_password_too_long,
	pattern: m.setup_password_pattern,
	"app-name": () => m.setup_password_app_name({ name: NAME }),
	username: m.setup_password_username,
	common: m.setup_password_common,
};

const tokenError = $derived(
	form?.tokenRefused && !edited.token ? m.setup_token_refused() : undefined,
);
const usernameError = $derived(
	form?.usernameError && !edited.username ? usernameMessages[form.usernameError]() : undefined,
);
const passwordError = $derived(
	form?.passwordError && !edited.password ? passwordMessages[form.passwordError]() : undefined,
);
// "Use at least 15 characters." already says what the helper says.
const passwordHelp = $derived(!(passwordError && form?.passwordError === "too-short"));

/**
 * The rules the browser can check, as the owner types (`lib/shared/password-rules.ts`). Until a
 * character is typed none counts as met: an empty password contains no username either.
 */
const rules = $derived.by(() => {
	const checked = passwordRules(passwordValue, usernameValue);
	if (passwordValue !== "") return checked;
	return {
		length: 0,
		met: { length: false, pattern: false, appName: false, username: false },
	};
});
const RULES: { key: keyof PasswordRulesMet; text: () => string }[] = [
	{ key: "length", text: () => m.setup_rule_length({ count: rules.length }) },
	{ key: "pattern", text: () => m.setup_rule_pattern() },
	{ key: "appName", text: () => m.setup_rule_app_name({ name: NAME }) },
	{ key: "username", text: () => m.setup_rule_username() },
];
/**
 * What the polite live region says: each rule and whether it is met, without the count, so it
 * changes, and is read out, only when a rule does, never on every keystroke.
 */
const announcement = $derived(
	RULES.map(({ key }) => {
		const status = rules.met[key] ? m.setup_rule_met() : m.setup_rule_unmet();
		const text =
			key === "length"
				? m.setup_rule_length_spoken()
				: RULES.find((rule) => rule.key === key)?.text();
		return `${status} ${text}`;
	}).join(" "),
);

/** The token helper with its format example set like the banner line it describes. */
const FORMAT = "\u0001";
const tokenHelp = m.setup_token_help({ format: FORMAT }).split(FORMAT);

/** Each field's description: its error, when it has one, then its helper. */
const describedBy = (id: string, error: string | undefined, help: boolean) =>
	[error ? `${id}-error` : undefined, help ? `${id}-help` : undefined].filter(Boolean).join(" ") ||
	undefined;

/** The token reads like the banner it came from: xxxx-xxxx-xxxx as it is typed. */
function formatToken(event: Event & { currentTarget: HTMLInputElement }) {
	edited.token = true;
	const input = event.currentTarget;
	const next = formatTokenInput(input.value, input.selectionStart ?? input.value.length);
	input.value = next.value;
	if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
}

/** Backspace or Delete next to a dash removes the character beyond it. */
function stepOverDash(event: InputEvent & { currentTarget: HTMLInputElement }) {
	const input = event.currentTarget;
	const caret = input.selectionStart;
	if (caret === null || caret !== input.selectionEnd) return;
	const direction =
		event.inputType === "deleteContentBackward"
			? "backward"
			: event.inputType === "deleteContentForward"
				? "forward"
				: undefined;
	if (direction === undefined) return;
	const next = deleteAcrossDash(input.value, caret, direction);
	if (next === undefined) return;
	event.preventDefault();
	input.value = next.value;
	input.setSelectionRange(next.caret, next.caret);
}

/**
 * While the claim runs, the button says so and can't be pressed again. A failed claim keeps the
 * username, clears the token and the password, and moves focus to the first field to fix.
 */
const submit: SubmitFunction = () => {
	submitting = true;
	edited = { token: true, username: true, password: true };
	return async ({ result, update }) => {
		if (result.type === "redirect") {
			await update();
			return;
		}
		await update({ reset: false });
		submitting = false;
		edited = { token: false, username: false, password: false };
		showPassword = false;
		if (tokenInput) tokenInput.value = "";
		passwordValue = "";
		await tick();
		// The first field to fix; after a server failure, the token, which the message asks for.
		(document.querySelector<HTMLElement>("[aria-invalid='true']") ?? tokenInput)?.focus();
	};
};

const field = css({ display: "flex", flexDirection: "column", gap: "sm" });
const label = css({ textStyle: "label" });
const help = css({ textStyle: "caption", color: "muted" });
const error = css({ textStyle: "caption", color: "danger", fontWeight: "semibold" });
const control = css({
	minHeight: "controlHeight",
	paddingInline: "md",
	bg: "surface",
	color: "text",
	caretColor: "primary",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "control-border",
	borderRadius: "control",
	transitionProperty: "border-color",
	transitionDuration: "feedback",
	_hover: { borderColor: "muted" },
	"&[aria-invalid=true]": { borderColor: "danger" },
});
</script>

<svelte:window onhashchange={takeTokenFromLink} />

<svelte:head>
	<title>{m.setup_page_title({ name: NAME })}</title>
</svelte:head>

<!-- The top banner carries the only aurora: two soft washes of the palette's own green and violet
     from the top edge, static, so reduced motion needs nothing. -->
<header
	class={css({
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "space-between",
		gap: "md",
		minHeight: "topbar",
		paddingBlock: "sm",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
		borderBottomWidth: "1px",
		borderBottomStyle: "solid",
		borderBottomColor: "border",
		bgImage:
			"[radial-gradient(60% 220% at 38% 0%, color-mix(in srgb, token(colors.primary) 22%, transparent), transparent 70%), radial-gradient(45% 220% at 68% -10%, color-mix(in srgb, token(colors.secondary) 20%, transparent), transparent 72%)]",
	})}
>
	<p
		class={css({
			display: "flex",
			alignItems: "center",
			gap: "sm",
			textStyle: "h3",
		})}
	>
		<img src="/comradarr-icon.svg" alt="" width="28" height="28">
		{NAME}
	</p>
	<LanguageSwitcher />
</header>

<main
	class={css({
		maxWidth: "formMax",
		marginInline: "auto",
		paddingBlock: { base: "xl", tablet: "section" },
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter" },
	})}
>
	<div
		class={css({
			padding: { base: "lg", tablet: "xxl" },
			bg: "surface",
			borderWidth: "1px",
			borderStyle: "solid",
			borderColor: "border",
			borderRadius: "panel",
		})}
	>
		<h1 class={css({ textStyle: "h1", textWrap: "balance", overflowWrap: "anywhere" })}>
			{m.setup_title({ name: NAME })}
		</h1>
		<p class={css({ marginBlockStart: "sm", color: "muted", textWrap: "pretty" })}>
			{m.setup_intro()}
		</p>

		<form
			method="post"
			novalidate
			use:enhance={submit}
			class={css({
				display: "flex",
				flexDirection: "column",
				gap: "xl",
				marginBlockStart: "xl",
			})}
		>
			<div class={field}>
				<label class={label} for="token">{m.setup_token_label()}</label>
				<input
					bind:this={tokenInput}
					class={[
						control,
						css({ fontFamily: "mono", fontSize: "body", fontVariantNumeric: "tabular-nums" }),
					]}
					id="token"
					name="token"
					type="text"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					aria-invalid={tokenError ? "true" : undefined}
					aria-describedby={describedBy("token", tokenError, true)}
					oninput={formatToken}
					onbeforeinput={stepOverDash}
				>
				{#if tokenError}
					<p class={error} id="token-error">{tokenError}</p>
				{/if}
				<!-- biome-ignore format: one line, so no whitespace lands between the format and its full stop -->
				<p class={help} id="token-help">{#each tokenHelp as part, index (index)}{#if index > 0}<code class={css({ fontFamily: "mono" })}>xxxx-xxxx-xxxx</code>{/if}{part}{/each}</p>
			</div>

			<div class={field}>
				<label class={label} for="username">{m.setup_username_label()}</label>
				<input
					class={control}
					id="username"
					name="username"
					type="text"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					bind:value={usernameValue}
					aria-invalid={usernameError ? "true" : undefined}
					oninput={() => (edited.username = true)}
					aria-describedby={describedBy("username", usernameError, false)}
				>
				{#if usernameError}
					<p class={error} id="username-error">{usernameError}</p>
				{/if}
			</div>

			<div class={field}>
				<label class={label} for="password">{m.setup_password_label()}</label>
				<!-- One bordered group holds the field and the control that shows what was typed. -->
				<div
					class={css({
						display: "flex",
						alignItems: "stretch",
						bg: "surface",
						borderWidth: "1px",
						borderStyle: "solid",
						borderColor: "control-border",
						borderRadius: "control",
						transitionProperty: "border-color",
						transitionDuration: "feedback",
						_hover: { borderColor: "muted" },
						"&:has([aria-invalid=true])": { borderColor: "danger" },
						// The field's focus ring goes round the whole group, as on the other fields.
						"&:has(input:focus-visible)": {
							outlineStyle: "solid",
							outlineWidth: "2px",
							outlineColor: "secondary",
							outlineOffset: "[2px]",
						},
					})}
				>
					<input
						bind:this={passwordInput}
						bind:value={passwordValue}
						class={css({
							flex: "1",
							minWidth: "[0]",
							minHeight: "controlHeight",
							paddingInline: "md",
							bg: "transparent",
							color: "text",
							caretColor: "primary",
							borderRadius: "control",
							_focusVisible: { outlineStyle: "none" },
						})}
						id="password"
						name="password"
						size="1"
						type={showPassword ? "text" : "password"}
						autocomplete="new-password"
						aria-invalid={passwordError ? "true" : undefined}
						aria-describedby={describedBy("password", passwordError, passwordHelp)}
						oninput={() => (edited.password = true)}
					>
					{#if hydrated}
						<button
							type="button"
							aria-controls="password"
							aria-label={showPassword
								? m.setup_password_hide_label()
								: m.setup_password_show_label()}
							onclick={() => (showPassword = !showPassword)}
							class={css({
								flex: "none",
								minWidth: "controlHeight",
								paddingInline: "md",
								textStyle: "label",
								color: "muted",
								cursor: "pointer",
								borderRadius: "control",
								_hover: { color: "text" },
								// Inside the group's border, so it never reads as a box beside the box.
								_focusVisible: { outlineOffset: "-xs" },
							})}
						>
							{showPassword ? m.setup_password_hide() : m.setup_password_show()}
						</button>
					{/if}
				</div>
				{#if passwordError}
					<p class={error} id="password-error">{passwordError}</p>
				{/if}
				{#if passwordHelp}
					<p class={help} id="password-help">{m.setup_password_help()}</p>
				{/if}
				{#if hydrated}
					<!-- What the password meets so far: rules, not a score, so a refused password can never
					     look strong. The polite region reads out a rule that changes, not every keystroke. -->
					<div class={css({ marginBlockStart: "xs" })}>
						<ul
							aria-label={m.setup_rules_label()}
							class={css({ display: "flex", flexDirection: "column", gap: "xs" })}
						>
							{#each RULES as rule (rule.key)}
								{@const met = rules.met[rule.key]}
								<li
									class={css({
										display: "flex",
										alignItems: "flex-start",
										gap: "sm",
										textStyle: "label",
										fontWeight: "regular",
										color: met ? "text" : "muted",
										transitionProperty: "color",
										transitionDuration: "feedback",
									})}
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 16 16"
										width="16"
										height="16"
										class={css({
											flex: "none",
											marginBlockStart: "[2px]",
											color: met ? "primary" : "control-border",
										})}
									>
										{#if met}
											<path
												d="M3.5 8.5 6.5 11.5 12.5 4.5"
												fill="none"
												stroke="currentColor"
												stroke-width="1.75"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										{:else}
											<circle
												cx="8"
												cy="8"
												r="5"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
											/>
										{/if}
									</svg>
									<span>
										<span class={css({ srOnly: true })}>
											{met ? m.setup_rule_met() : m.setup_rule_unmet()}
										</span>
										{rule.text()}
									</span>
								</li>
							{/each}
						</ul>
						<p class={[help, css({ marginBlockStart: "sm" })]}>{m.setup_rules_common()}</p>
						<p class={css({ srOnly: true })} aria-live="polite">{announcement}</p>
					</div>
				{/if}
			</div>

			{#if form?.failed}
				<p class={error} role="alert">{m.setup_failed({ name: NAME })}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class={css({
					minHeight: "controlHeight",
					paddingInline: "xl",
					bg: "primary",
					color: "background",
					textStyle: "label",
					fontSize: "body",
					borderRadius: "control",
					cursor: "pointer",
					transitionProperty: "background-color, color",
					transitionDuration: "press",
					// A lighter green, so the violet focus ring never meets a violet fill.
					_enabled: {
						_hover: { bg: "[color-mix(in srgb, token(colors.primary) 88%, token(colors.text))]" },
					},
					_disabled: { bg: "raised", color: "muted", cursor: "progress" },
				})}
			>
				{submitting ? m.setup_submitting() : m.setup_submit()}
			</button>
		</form>
	</div>
</main>
