<script lang="ts">
import { css } from "#styled-system/css";
</script>

<svelte:head>
	<title>Comradarr</title>
</svelte:head>

<!-- Placeholder until a module gives / a surface. The legacy spec defines none: its setup gate
     (§9.2) sends browsers to setup, and the dashboard is `/dashboard`. -->
<main
	class={css({
		maxWidth: "readingMax",
		marginInline: "auto",
		paddingBlock: "hero",
		paddingInline: { base: "mobileGutter", tablet: "tabletGutter", desktop: "desktopGutter" },
	})}
>
	<h1 class={css({ textStyle: "h1", textWrap: "balance" })}>Comradarr is being rebuilt.</h1>
	<p class={css({ marginBlockStart: "lg", color: "muted", textWrap: "pretty" })}>
		The rotation, the dashboard and the connector settings are on their way back. Nothing searches
		your libraries yet.
	</p>
</main>
