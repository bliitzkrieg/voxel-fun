<script lang="ts">
	import { onMount } from 'svelte';

	import { Game } from '$lib/engine/game';

	let container: HTMLDivElement;
	let game: Game | null = null;
	let devWorldStatus = $state('Autosaves after edits.');
	const isDevelopment = import.meta.env.DEV;

	onMount(() => {
		const currentGame = new Game(container);
		game = currentGame;
		currentGame.init();

		return () => {
			currentGame.dispose();
			game = null;
		};
	});

	function handleSaveWorld(): void {
		if (game?.saveWorld()) {
			devWorldStatus = 'World saved for refreshes.';
		}
	}

	function handleResetWorld(): void {
		if (!game) {
			return;
		}

		if (
			!window.confirm('Reset the world to the starter layout and overwrite the current dev save?')
		) {
			return;
		}

		if (game.resetWorld()) {
			devWorldStatus = 'World reset to the starter layout.';
		}
	}

	async function handleExportWorld(): Promise<void> {
		if (!game) {
			return;
		}

		devWorldStatus = (await game.exportWorldToDisk())
			? 'World exported to disk.'
			: 'Export was canceled.';
	}

	async function handleImportWorld(): Promise<void> {
		if (!game) {
			return;
		}

		devWorldStatus = (await game.importWorldFromDisk())
			? 'World imported and saved locally.'
			: 'Import was canceled or invalid.';
	}
</script>

<main class="viewport-shell">
	<div class="viewport" bind:this={container}></div>

	<div class="hud-frame hud-frame-top">
		<div class="hud-brand">
			<span class="hud-brand-mark"></span>
			<div>
				<div class="hud-eyebrow">Sandbox Build Mode</div>
				<div class="hud-title">Voxel Forge</div>
			</div>
		</div>
	</div>

	{#if isDevelopment}
		<div class="dev-world-panel">
			<div class="dev-world-label">Dev World</div>
			<div class="dev-world-actions">
				<button class="dev-world-button" type="button" onclick={handleSaveWorld}>Save</button>
				<button class="dev-world-button" type="button" onclick={handleResetWorld}>Reset</button>
				<button class="dev-world-button" type="button" onclick={handleExportWorld}>Export</button>
				<button class="dev-world-button" type="button" onclick={handleImportWorld}>Import</button>
			</div>
			<div class="dev-world-status">{devWorldStatus}</div>
		</div>
	{/if}

	<div class="crosshair" aria-hidden="true">
		<span class="crosshair-ring"></span>
		<span class="crosshair-center"></span>
	</div>

	<div class="control-dock">
		<div class="dock-section">
			<div class="dock-label">Move</div>
			<div class="dock-row">
				<span class="keycap">WASD</span>
				<span class="dock-copy">Move</span>
				<span class="keycap">Shift</span>
				<span class="dock-copy">Sprint</span>
				<span class="keycap">Space</span>
				<span class="dock-copy">Jump</span>
			</div>
		</div>
		<div class="dock-section">
			<div class="dock-label">Build</div>
			<div class="dock-row">
				<span class="keycap">Q</span>
				<span class="dock-copy">Add</span>
				<span class="keycap">E</span>
				<span class="dock-copy">Erase</span>
				<span class="keycap">R</span>
				<span class="dock-copy">Paint</span>
				<span class="keycap">B/H/C</span>
				<span class="dock-copy">Fill, Hollow, Carve</span>
			</div>
		</div>
		<div class="dock-section">
			<div class="dock-label">Adjust</div>
			<div class="dock-row">
				<span class="keycap">1-9</span>
				<span class="dock-copy">Material</span>
				<span class="keycap">MMB</span>
				<span class="dock-copy">Pick</span>
				<span class="keycap">Wheel</span>
				<span class="dock-copy">Size</span>
				<span class="keycap">- =</span>
				<span class="dock-copy">Step Size</span>
			</div>
		</div>
		<div class="dock-section dock-section-tip">
			<div class="dock-label">Tip</div>
			<div class="dock-row dock-row-tip">
				Hold <span class="keycap">Shift</span> while dragging to grow a region. Tap
				<span class="keycap">Ctrl+Z</span> to undo.
			</div>
		</div>
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
		background:
			radial-gradient(circle at top, rgba(227, 242, 245, 0.65), transparent 38%),
			linear-gradient(180deg, #d7e6ea 0%, #bccbd0 48%, #9aa7ac 100%);
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

	.hud-frame {
		position: absolute;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 16px;
		border: 1px solid rgba(255, 255, 255, 0.44);
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(12, 20, 23, 0.72), rgba(12, 20, 23, 0.48)),
			radial-gradient(circle at top left, rgba(116, 255, 216, 0.14), transparent 48%);
		box-shadow:
			0 18px 42px rgba(9, 13, 16, 0.22),
			inset 0 1px 0 rgba(255, 255, 255, 0.16);
		backdrop-filter: blur(16px);
		color: #edf6f2;
	}

	.hud-frame-top {
		top: 16px;
		left: 16px;
		right: auto;
		max-width: calc(100vw - 32px);
	}

	.hud-brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.hud-brand-mark {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		background: linear-gradient(135deg, #74ffd8 0%, #3ecafc 58%, #f0fff2 100%);
		box-shadow:
			0 0 0 3px rgba(116, 255, 216, 0.12),
			0 8px 22px rgba(62, 202, 252, 0.24);
		transform: rotate(45deg);
	}

	.hud-eyebrow {
		color: rgba(216, 235, 228, 0.72);
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.dev-world-panel {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 2;
		width: min(244px, calc(100vw - 32px));
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.42);
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(12, 20, 23, 0.78), rgba(12, 20, 23, 0.54)),
			radial-gradient(circle at top right, rgba(62, 202, 252, 0.16), transparent 44%);
		box-shadow:
			0 18px 40px rgba(9, 13, 16, 0.22),
			inset 0 1px 0 rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(16px);
		color: #eef8f4;
		pointer-events: auto;
	}

	.dev-world-label {
		margin-bottom: 10px;
		color: rgba(216, 235, 228, 0.74);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.dev-world-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.dev-world-button {
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 12px;
		background:
			linear-gradient(180deg, rgba(240, 251, 248, 0.12), rgba(240, 251, 248, 0.05)),
			radial-gradient(circle at top, rgba(116, 255, 216, 0.12), transparent 52%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
		color: #edf8f4;
		font: inherit;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			background-color 140ms ease;
	}

	.dev-world-button:hover {
		border-color: rgba(116, 255, 216, 0.42);
		transform: translateY(-1px);
	}

	.dev-world-button:active {
		transform: translateY(0);
	}

	.dev-world-status {
		margin-top: 10px;
		color: rgba(230, 244, 239, 0.74);
		font-size: 0.76rem;
		line-height: 1.4;
	}

	.hud-title {
		font-size: 0.96rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.crosshair {
		position: absolute;
		left: 50%;
		top: 50%;
		z-index: 2;
		width: 28px;
		height: 28px;
		transform: translate(-50%, -50%);
		pointer-events: none;
		transition: opacity 140ms ease;
	}

	:global(.crosshair-hidden) {
		opacity: 0;
	}

	.crosshair-ring,
	.crosshair-center {
		position: absolute;
		inset: 0;
		margin: auto;
	}

	.crosshair-ring {
		width: 24px;
		height: 24px;
		border: 1px solid rgba(235, 249, 255, 0.45);
		border-radius: 999px;
		box-shadow: 0 0 18px rgba(255, 255, 255, 0.08);
	}

	.crosshair-center {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: #f6fffd;
		box-shadow:
			0 0 0 4px rgba(116, 255, 216, 0.18),
			0 0 18px rgba(62, 202, 252, 0.34);
	}

	.control-dock {
		position: absolute;
		left: 50%;
		bottom: 16px;
		z-index: 2;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, auto));
		gap: 10px;
		width: min(1160px, calc(100vw - 32px));
		padding: 10px;
		transform: translateX(-50%);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 26px;
		background:
			linear-gradient(180deg, rgba(15, 26, 28, 0.78), rgba(15, 26, 28, 0.54)),
			radial-gradient(circle at bottom, rgba(116, 255, 216, 0.12), transparent 50%);
		box-shadow:
			0 26px 56px rgba(10, 14, 17, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(16px);
		color: #edf7f5;
		pointer-events: none;
	}

	.dock-section {
		padding: 14px 16px;
		border-radius: 18px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
	}

	.dock-section-tip {
		background:
			linear-gradient(180deg, rgba(116, 255, 216, 0.12), rgba(62, 202, 252, 0.08)),
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
	}

	.dock-label {
		margin-bottom: 8px;
		color: rgba(217, 240, 233, 0.68);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.dock-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.dock-row-tip {
		color: #f2fffb;
	}

	.keycap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 28px;
		padding: 0 10px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 10px;
		background: rgba(240, 251, 248, 0.1);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.dock-copy {
		color: rgba(232, 245, 241, 0.84);
	}

	:global(.game-hud) {
		position: absolute;
		top: 104px;
		left: 16px;
		z-index: 2;
		width: min(210px, calc(100vw - 32px));
		padding: 16px;
		border: 1px solid rgba(255, 255, 255, 0.38);
		border-radius: 22px;
		background:
			linear-gradient(180deg, rgba(11, 20, 22, 0.82), rgba(11, 20, 22, 0.58)),
			radial-gradient(circle at top left, rgba(116, 255, 216, 0.15), transparent 44%);
		box-shadow:
			0 24px 54px rgba(8, 11, 13, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(16px);
		color: #edf7f3;
		pointer-events: none;
	}

	:global(.hud-panel-header) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		margin-bottom: 16px;
	}

	:global(.hud-panel-title) {
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	:global(.hud-panel-fps) {
		padding: 6px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: rgba(235, 249, 245, 0.86);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	:global(.hud-chip-row) {
		display: grid;
		justify-items: start;
		gap: 8px;
		margin-bottom: 16px;
	}

	:global(.hud-chip) {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	:global(.hud-chip-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #74ffd8;
		box-shadow: 0 0 10px rgba(116, 255, 216, 0.44);
	}

	:global(.hud-grid) {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 10px;
		margin-bottom: 16px;
	}

	:global(.hud-card) {
		padding: 13px 12px;
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03)),
			radial-gradient(circle at top right, rgba(62, 202, 252, 0.12), transparent 48%);
	}

	:global(.hud-card-label) {
		margin-bottom: 6px;
		color: rgba(216, 239, 230, 0.62);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	:global(.hud-card-value) {
		font-size: 0.96rem;
		font-weight: 700;
		line-height: 1.25;
	}

	:global(.hud-card-subvalue) {
		margin-top: 4px;
		color: rgba(230, 244, 239, 0.68);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	:global(.hud-target-block) {
		padding: 12px;
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(116, 255, 216, 0.1), rgba(62, 202, 252, 0.06)),
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
	}

	:global(.hud-target-title) {
		margin-bottom: 8px;
		color: rgba(216, 239, 230, 0.7);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	:global(.hud-target-copy) {
		font-size: 0.82rem;
		line-height: 1.45;
	}

	:global(.hud-target-copy strong) {
		color: #ffffff;
		font-weight: 700;
	}

	@media (max-width: 980px) {
		.control-dock {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.hud-frame-top {
			flex-direction: column;
			align-items: flex-start;
		}

		.dev-world-panel {
			top: auto;
			right: 16px;
			bottom: 132px;
		}

		.control-dock {
			grid-template-columns: minmax(0, 1fr);
		}

		:global(.game-hud) {
			width: calc(100vw - 32px);
		}
	}
</style>
