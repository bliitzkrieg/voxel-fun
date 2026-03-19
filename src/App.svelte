<script lang="ts">
	import { onMount } from 'svelte';

	import { Game } from '$lib/engine/game';

	let container: HTMLDivElement;

	onMount(() => {
		const game = new Game(container);
		game.init();

		return () => {
			game.dispose();
		};
	});
</script>

<main class="viewport-shell">
	<div class="viewport" bind:this={container}></div>

	<div class="hint">
		Click to capture mouse
		<br />
		WASD move, Shift sprint, Space jump, Tab editor
		<br />
		Q/E/R brush, B/H/C box, [ ] or wheel material, 1/2/3/4 planes
		<br />
		Hold Shift while dragging to grow an area
	</div>
</main>

<style>
	:global(html, body) {
		margin: 0;
		width: 100%;
		height: 100%;
		min-height: 100%;
	}

	:global(body) {
		overflow: hidden;
		background: #c9d0cf;
		font-family: 'Aptos', 'Trebuchet MS', sans-serif;
	}

	:global(canvas) {
		display: block;
	}

	.viewport-shell {
		position: relative;
		width: 100%;
		height: 100vh;
		height: 100svh;
		min-height: 100vh;
		overflow: hidden;
	}

	.viewport {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.hint {
		position: absolute;
		right: 16px;
		bottom: 16px;
		z-index: 1;
		padding: 10px 12px;
		border-radius: 12px;
		background: rgba(246, 241, 232, 0.82);
		color: #1a2024;
		font-size: 0.78rem;
		line-height: 1.45;
		text-align: right;
		pointer-events: none;
		backdrop-filter: blur(6px);
	}
</style>
