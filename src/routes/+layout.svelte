<script lang="ts">
// DESIGN.md's typefaces, bundled so no page requests a remote font: Source Sans 3 in every weight
// (one variable font), and IBM Plex Mono at 400 for code and 500 for numbers.
import "@fontsource-variable/source-sans-3";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../app.css";
import { onMount } from "svelte";
import type { LayoutProps } from "./$types";

let { children }: LayoutProps = $props();

// A client-side signal that the app has hydrated, for the e2e tests to wait on.
onMount(() => {
	document.documentElement.dataset.hydrated = "";
});
</script>

{@render children()}
