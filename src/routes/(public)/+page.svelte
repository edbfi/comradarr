<script lang="ts">
import LanguageSwitcher from "#lib/components/layout/LanguageSwitcher.svelte";
import { m } from "#lib/paraglide/messages.js";
import { css } from "#styled-system/css";
</script>

<svelte:head>
	<title>Comradarr</title>
</svelte:head>

<!-- Placeholder until a module gives / a surface. No module defines one: the setup gate (`setup`)
     sends browsers to setup, and the dashboard is `/dashboard`. -->
<main
	class={css({
		maxWidth: "readingMax",
		marginInline: "auto",
		paddingBlock: "hero",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
	})}
>
	<div
		class={css({
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "md",
		})}
	>
		<!-- A word too long for the line breaks, as it did before this row. Without `anywhere`, the
		     heading, as a flex item, keeps its longest word's width and overflows a 360px screen at
		     200% zoom. -->
		<h1 class={css({ textStyle: "h1", textWrap: "balance", overflowWrap: "anywhere" })}>
			{m.placeholder_title({ name: "Comradarr" })}
		</h1>
		<LanguageSwitcher />
	</div>
	<p class={css({ marginBlockStart: "lg", color: "muted", textWrap: "pretty" })}>
		{m.placeholder_body()}
	</p>
</main>
