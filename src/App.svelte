<script lang="ts">
	import { onMount } from 'svelte';

	import { Game } from '$lib/engine/game';
	import {
		closeMaterialManager,
		setMaterialManagerAssignmentSlot,
		subscribeMaterialManagerUiState,
		type MaterialManagerUiState
	} from '$lib/ui/materialManagerState';
	import {
		closeNaturePanel,
		setNaturePreset,
		subscribeNatureUiState,
		type NatureUiState
	} from '$lib/ui/natureState';
	import {
		closePropManager,
		subscribePropUiState,
		type PropUiState
	} from '$lib/ui/propManagerState';
	import {
		DEFAULT_NATURE_FLOWER_SETTINGS,
		DEFAULT_NATURE_GRASS_SETTINGS,
		DEFAULT_NATURE_TREE_SETTINGS
	} from '$lib/nature/natureTypes';
	import type {
		NatureGrassHeightVariance,
		NaturePreset,
		NatureTreeSize
	} from '$lib/nature/natureTypes';
	import { subscribePropLibrary, type PropLibraryState } from '$lib/voxel/propLibrary';
	import {
		subscribeVoxelPalette,
		type VoxelPaletteEntry,
		type VoxelPaletteState
	} from '$lib/voxel/voxelPalette';

	let container: HTMLDivElement;
	let game: Game | null = null;
	let devWorldStatus = $state('Autosaves after edits.');
	let materialManagerState = $state<MaterialManagerUiState>({
		open: false,
		assignmentSlotIndex: null
	});
	let voxelPaletteState = $state<VoxelPaletteState>({
		materials: [],
		hotbar: []
	});
	let propUiState = $state<PropUiState>({
		managerOpen: false,
		placementActive: false,
		placementPropId: null,
		placementPropName: null,
		transformMode: 'translate'
	});
	let natureUiState = $state<NatureUiState>({
		open: false,
		activePreset: 'grass',
		activeTool: null,
		grassSettings: { ...DEFAULT_NATURE_GRASS_SETTINGS },
		flowerSettings: { ...DEFAULT_NATURE_FLOWER_SETTINGS },
		treeSettings: { ...DEFAULT_NATURE_TREE_SETTINGS }
	});
	let propLibraryState = $state<PropLibraryState>({ props: [] });
	let selectedMaterialId = $state(0);
	let newMaterialName = $state('');
	let newMaterialColor = $state('#74ffd8');
	let newMaterialOpacity = $state(100);
	let newMaterialIsWater = $state(false);
	let newMaterialEmitsLight = $state(false);
	let newMaterialLightTint = $state('#74ffd8');
	let draggedMaterialId = $state<number | null>(null);
	let hotbarDropSlotIndex = $state<number | null>(null);
	let newPropName = $state('');
	let newPropInteractable = $state(false);
	let selectedPropBlockCount = $state(0);
	const isDevelopment = import.meta.env.DEV;
	const grassVarianceOptions: Array<{
		value: NatureGrassHeightVariance;
		label: string;
		copy: string;
	}> = [
		{ value: 'low', label: 'Low', copy: 'Mostly clipped tufts with a few short rises.' },
		{ value: 'medium', label: 'Medium', copy: 'Patchy yard grass with a little layered height.' },
		{ value: 'high', label: 'High', copy: 'More broken-up tufts and taller stray blades.' }
	];
	const treeSizeOptions: Array<{ value: NatureTreeSize; label: string; copy: string }> = [
		{ value: 'small', label: 'Small', copy: 'Street-edge sapling with a compact crown.' },
		{
			value: 'medium',
			label: 'Medium',
			copy: 'Balanced neighborhood tree with readable branching.'
		},
		{ value: 'large', label: 'Large', copy: 'Taller canopy with deeper branch spread.' }
	];

	$effect(() => {
		if (!newMaterialEmitsLight) {
			newMaterialLightTint = newMaterialColor;
		}
	});

	onMount(() => {
		const currentGame = new Game(container);
		game = currentGame;
		currentGame.init();

		const unsubscribeMaterialManager = subscribeMaterialManagerUiState((state) => {
			materialManagerState = state;

			if (state.open && currentGame) {
				selectedMaterialId = currentGame.getSelectedMaterialId();
			}
		});
		const unsubscribePalette = subscribeVoxelPalette((state) => {
			voxelPaletteState = state;
		});
		const unsubscribePropUi = subscribePropUiState((state) => {
			propUiState = state;

			if (state.managerOpen && currentGame) {
				selectedPropBlockCount = currentGame.getSelectedPropBlockCount();
			}
		});
		const unsubscribeNatureUi = subscribeNatureUiState((state) => {
			natureUiState = state;
		});
		const unsubscribePropLibrary = subscribePropLibrary((state) => {
			propLibraryState = state;
		});

		return () => {
			unsubscribeMaterialManager();
			unsubscribePalette();
			unsubscribePropUi();
			unsubscribeNatureUi();
			unsubscribePropLibrary();
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

	function handleCloseMaterialManager(): void {
		closeMaterialManager();
	}

	function handleClosePropManager(): void {
		closePropManager();
	}

	function handleCloseNaturePanel(): void {
		closeNaturePanel();
	}

	function handleSelectNaturePreset(preset: NaturePreset): void {
		setNaturePreset(preset);
	}

	function handleActivateNaturePreset(preset: NaturePreset): void {
		game?.activateNaturePreset(preset);
	}

	function handleHotbarSlotClick(slotIndex: number): void {
		setMaterialManagerAssignmentSlot(
			materialManagerState.assignmentSlotIndex === slotIndex ? null : slotIndex
		);
	}

	function handleMaterialDragStart(event: DragEvent, materialId: number): void {
		draggedMaterialId = materialId;
		event.dataTransfer?.setData('text/plain', String(materialId));
		event.dataTransfer?.setData('application/x-voxel-material-id', String(materialId));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleMaterialDragEnd(): void {
		draggedMaterialId = null;
		hotbarDropSlotIndex = null;
	}

	function handleHotbarDragOver(event: DragEvent, slotIndex: number): void {
		if (getDraggedMaterialId(event) === null) {
			return;
		}

		event.preventDefault();
		hotbarDropSlotIndex = slotIndex;

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleHotbarDragLeave(slotIndex: number): void {
		if (hotbarDropSlotIndex === slotIndex) {
			hotbarDropSlotIndex = null;
		}
	}

	function handleHotbarDrop(event: DragEvent, slotIndex: number): void {
		const materialId = getDraggedMaterialId(event);
		event.preventDefault();
		hotbarDropSlotIndex = null;
		draggedMaterialId = null;

		if (materialId === null || !game) {
			return;
		}

		game.assignMaterialToHotbarSlot(slotIndex, materialId);
		game.selectMaterial(materialId);
		selectedMaterialId = game.getSelectedMaterialId();
		setMaterialManagerAssignmentSlot(null);
	}

	function handleClearHotbarSlot(slotIndex: number): void {
		game?.assignMaterialToHotbarSlot(slotIndex, null);
	}

	function handleSelectMaterial(materialId: number): void {
		if (!game) {
			return;
		}

		const assignmentSlotIndex = materialManagerState.assignmentSlotIndex;

		if (assignmentSlotIndex !== null) {
			game.assignMaterialToHotbarSlot(assignmentSlotIndex, materialId);
			setMaterialManagerAssignmentSlot(null);
		}

		game.selectMaterial(materialId);
		selectedMaterialId = game.getSelectedMaterialId();
	}

	function handleDeleteMaterial(materialId: number): void {
		if (!game?.deleteMaterial(materialId)) {
			return;
		}

		selectedMaterialId = game.getSelectedMaterialId();
	}

	function handleToggleMaterialEmission(material: VoxelPaletteEntry, emitsLight: boolean): void {
		game?.updateMaterialLighting(material.id, {
			emitsLight,
			lightTint: material.lightTint
		});
	}

	function handleToggleMaterialWater(material: VoxelPaletteEntry, isWater: boolean): void {
		game?.updateMaterialWater(material.id, { isWater });
	}

	function handleMaterialLightTintChange(material: VoxelPaletteEntry, tintHex: string): void {
		game?.updateMaterialLighting(material.id, {
			emitsLight: true,
			lightTint: hexToRgbTuple(tintHex)
		});
	}

	function handleCreateMaterial(): void {
		if (!game) {
			return;
		}

		const created = game.createMaterial({
			name: newMaterialName,
			color: hexToRgbTuple(newMaterialColor),
			opacity: clampOpacity(newMaterialOpacity / 100),
			isWater: newMaterialIsWater,
			emitsLight: newMaterialEmitsLight,
			lightTint: hexToRgbTuple(newMaterialLightTint)
		});

		if (!created) {
			return;
		}

		selectedMaterialId = game.getSelectedMaterialId();
		newMaterialName = '';
		newMaterialColor = '#74ffd8';
		newMaterialOpacity = 100;
		newMaterialIsWater = false;
		newMaterialEmitsLight = false;
		newMaterialLightTint = '#74ffd8';
	}

	function handleCreateProp(): void {
		if (!game) {
			return;
		}

		const created = game.createProp({
			name: newPropName,
			interactable: newPropInteractable
		});

		if (!created) {
			return;
		}

		newPropName = '';
		newPropInteractable = false;
		selectedPropBlockCount = game.getSelectedPropBlockCount();
	}

	function handleSpawnProp(propId: number): void {
		game?.startPropPlacement(propId);
	}

	function handleDeleteProp(propId: number): void {
		if (
			!window.confirm(
				'Delete this prop definition and remove every still-linked placed copy from the world?'
			)
		) {
			return;
		}

		game?.deleteProp(propId);
	}

	function handleNatureGrassRadiusChange(value: string): void {
		const radius = Number.parseInt(value, 10);

		if (!Number.isFinite(radius)) {
			return;
		}

		game?.updateNatureGrassSettings({ radius });
	}

	function handleNatureGrassDensityChange(value: string): void {
		const density = Number.parseFloat(value);

		if (!Number.isFinite(density)) {
			return;
		}

		game?.updateNatureGrassSettings({ density });
	}

	function handleNatureGrassVarianceChange(value: string): void {
		if (value !== 'low' && value !== 'medium' && value !== 'high') {
			return;
		}

		game?.updateNatureGrassSettings({ heightVariance: value });
	}

	function handleNatureGrassSeedChange(value: string): void {
		const seedOffset = Number.parseInt(value, 10);

		if (!Number.isFinite(seedOffset)) {
			return;
		}

		game?.updateNatureGrassSettings({ seedOffset });
	}

	function handleNatureFlowerRadiusChange(value: string): void {
		const radius = Number.parseInt(value, 10);

		if (!Number.isFinite(radius)) {
			return;
		}

		game?.updateNatureFlowerSettings({ radius });
	}

	function handleNatureFlowerDensityChange(value: string): void {
		const density = Number.parseFloat(value);

		if (!Number.isFinite(density)) {
			return;
		}

		game?.updateNatureFlowerSettings({ density });
	}

	function handleNatureFlowerSeedChange(value: string): void {
		const seedOffset = Number.parseInt(value, 10);

		if (!Number.isFinite(seedOffset)) {
			return;
		}

		game?.updateNatureFlowerSettings({ seedOffset });
	}

	function handleNatureTreeSizeChange(value: string): void {
		if (value !== 'small' && value !== 'medium' && value !== 'large') {
			return;
		}

		game?.updateNatureTreeSettings({ size: value });
	}

	function handleNatureTreeSeedChange(value: string): void {
		const seedOffset = Number.parseInt(value, 10);

		if (!Number.isFinite(seedOffset)) {
			return;
		}

		game?.updateNatureTreeSettings({ seedOffset });
	}

	function getVisibleMaterials(): VoxelPaletteEntry[] {
		return voxelPaletteState.materials.filter((material) => !material.archived);
	}

	function getProps() {
		return [...propLibraryState.props].sort((a, b) => a.id - b.id);
	}

	function getHotbarMaterial(slotIndex: number): VoxelPaletteEntry | null {
		const materialId = voxelPaletteState.hotbar[slotIndex];
		return voxelPaletteState.materials.find((material) => material.id === materialId) ?? null;
	}

	function isSelectedMaterial(materialId: number): boolean {
		return selectedMaterialId === materialId;
	}

	function formatOpacity(opacity: number): string {
		return `${Math.round(opacity * 100)}%`;
	}

	function colorToCss(color: [number, number, number]): string {
		return `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`;
	}

	function rgbTupleToHex(color: [number, number, number]): string {
		return `#${color
			.map((component) =>
				Math.round(Math.max(0, Math.min(1, component)) * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')}`;
	}

	function hexToRgbTuple(value: string): [number, number, number] {
		const normalized = value.startsWith('#') ? value.slice(1) : value;
		const safeHex = normalized.length === 6 ? normalized : '74ffd8';

		return [
			parseInt(safeHex.slice(0, 2), 16) / 255,
			parseInt(safeHex.slice(2, 4), 16) / 255,
			parseInt(safeHex.slice(4, 6), 16) / 255
		];
	}

	function clampOpacity(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	function getDraggedMaterialId(event: DragEvent): number | null {
		const payload =
			event.dataTransfer?.getData('application/x-voxel-material-id') ||
			event.dataTransfer?.getData('text/plain');
		const parsed = payload ? Number.parseInt(payload, 10) : draggedMaterialId;
		return Number.isInteger(parsed) ? parsed : null;
	}

	function formatNatureDensity(value: number): string {
		return `${Math.round(value * 100)}%`;
	}

	function getNaturePresetTitle(preset: NaturePreset): string {
		switch (preset) {
			case 'grass':
				return 'Grass Brush';
			case 'flowers':
				return 'Flower Brush';
			default:
				return 'Tree Generator';
		}
	}

	function getNatureToolTitle(): string {
		switch (natureUiState.activeTool) {
			case 'grass-paint':
				return 'Grass Painting';
			case 'flower-paint':
				return 'Flower Painting';
			default:
				return 'Tree Planting';
		}
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
				<span class="keycap">Ctrl</span>
				<span class="dock-copy">Crouch</span>
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
				<span class="dock-copy">Hotbar</span>
				<span class="keycap">L</span>
				<span class="dock-copy">Day/Night</span>
				<span class="keycap">G</span>
				<span class="dock-copy">Grass</span>
				<span class="keycap">F</span>
				<span class="dock-copy">Flowers</span>
				<span class="keycap">T</span>
				<span class="dock-copy">Trees</span>
				<span class="keycap">M</span>
				<span class="dock-copy">Materials</span>
				<span class="keycap">N</span>
				<span class="dock-copy">Nature Tune</span>
				<span class="keycap">P</span>
				<span class="dock-copy">Props</span>
				<span class="keycap">X</span>
				<span class="dock-copy">Select</span>
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
				<span class="keycap">Shift+Drag</span>
				<span class="dock-copy">Region</span>
				<span class="keycap">Ctrl/Cmd+Click</span>
				<span class="dock-copy">Connected</span>
				<span class="keycap">Ctrl+Z</span>
				<span class="dock-copy">Undo</span>
			</div>
		</div>
	</div>

	{#if materialManagerState.open}
		<div class="material-overlay" role="dialog" aria-modal="true" aria-label="Material Manager">
			<button
				class="material-overlay-backdrop"
				type="button"
				aria-label="Close material manager"
				onclick={handleCloseMaterialManager}
			></button>

			<section class="material-panel">
				<header class="material-panel-head">
					<div>
						<div class="material-panel-kicker">Build Surface Library</div>
						<h2 class="material-panel-title">Material Forge</h2>
						<p class="material-panel-copy">
							Create, bind, and retire build materials without leaving the world.
						</p>
					</div>

					<div class="material-panel-actions">
						<div class="material-panel-note">
							{#if materialManagerState.assignmentSlotIndex !== null}
								Assigning next pick to slot {materialManagerState.assignmentSlotIndex + 1}
							{:else}
								Click a slot, then a material, to rebind it.
							{/if}
						</div>
						<button class="material-close" type="button" onclick={handleCloseMaterialManager}>
							Close
						</button>
					</div>
				</header>

				<div class="material-panel-body">
					<div class="material-slots">
						{#each Array.from({ length: 9 }, (_, slotIndex) => slotIndex) as slotIndex (slotIndex)}
							{@const slotMaterial = getHotbarMaterial(slotIndex)}
							<div
								class:material-slot-drop-target={hotbarDropSlotIndex === slotIndex}
								class:material-slot-active={materialManagerState.assignmentSlotIndex === slotIndex}
								class="material-slot"
								role="button"
								tabindex="0"
								onclick={() => handleHotbarSlotClick(slotIndex)}
								ondragover={(event) => handleHotbarDragOver(event, slotIndex)}
								ondragleave={() => handleHotbarDragLeave(slotIndex)}
								ondrop={(event) => handleHotbarDrop(event, slotIndex)}
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										handleHotbarSlotClick(slotIndex);
									}
								}}
							>
								<div class="material-slot-index">{slotIndex + 1}</div>
								<div class="material-slot-main">
									{#if slotMaterial}
										<div
											class:material-swatch-emissive={slotMaterial.emitsLight}
											class="material-slot-swatch"
											style={`--material-color: ${colorToCss(slotMaterial.color)}; --material-opacity: ${slotMaterial.opacity}; --material-light-tint: ${colorToCss(slotMaterial.lightTint)};`}
										></div>
										<div class="material-slot-meta">
											<div class="material-slot-name">{slotMaterial.name}</div>
											<div class="material-slot-opacity">{formatOpacity(slotMaterial.opacity)}</div>
											<div class="material-badge-row">
												{#if slotMaterial.isWater}
													<div class="material-badge material-badge-water">Water</div>
												{/if}
												{#if slotMaterial.emitsLight}
													<div class="material-badge material-badge-light">Glow</div>
												{/if}
											</div>
										</div>
										<button
											class="material-slot-clear"
											type="button"
											aria-label={`Clear slot ${slotIndex + 1}`}
											onclick={(event) => {
												event.stopPropagation();
												handleClearHotbarSlot(slotIndex);
											}}
										>
											Clear
										</button>
									{:else}
										<div class="material-slot-empty">Empty slot</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<div class="material-workbench">
						<section class="material-grid-panel">
							<div class="material-grid-head">
								<div>
									<div class="material-grid-title">Active Materials</div>
									<div class="material-grid-subtitle">{getVisibleMaterials().length} loaded</div>
								</div>
								<div class="material-grid-note">Drag cards onto slots 1-9 to bind hotkeys.</div>
							</div>
							<div class="material-grid">
								{#each getVisibleMaterials() as material (material.id)}
									<article
										class:material-card-dragging={draggedMaterialId === material.id}
										class:material-card-selected={isSelectedMaterial(material.id)}
										class="material-card"
										draggable="true"
										ondragstart={(event) => handleMaterialDragStart(event, material.id)}
										ondragend={handleMaterialDragEnd}
									>
										<button
											class="material-card-hit"
											type="button"
											onclick={() => handleSelectMaterial(material.id)}
										>
											<div
												class:material-swatch-emissive={material.emitsLight}
												class="material-card-swatch"
												style={`--material-color: ${colorToCss(material.color)}; --material-opacity: ${material.opacity}; --material-light-tint: ${colorToCss(material.lightTint)};`}
											></div>
											<div class="material-card-copy">
												<div class="material-card-name-row">
													<div class="material-card-name">{material.name}</div>
													<div class="material-badge-row">
														{#if material.isWater}
															<div class="material-badge material-badge-water">Water</div>
														{/if}
														{#if material.emitsLight}
															<div class="material-badge material-badge-light">Glow</div>
														{/if}
													</div>
												</div>
												<div class="material-card-meta">
													<span>ID {material.id}</span>
													<span>{formatOpacity(material.opacity)}</span>
												</div>
											</div>
										</button>
										<label class="material-inline-toggle">
											<input
												type="checkbox"
												checked={material.isWater}
												onchange={(event) =>
													handleToggleMaterialWater(
														material,
														(event.currentTarget as HTMLInputElement).checked
													)}
											/>
											<span>Water</span>
										</label>
										<label class="material-inline-toggle">
											<input
												type="checkbox"
												checked={material.emitsLight}
												onchange={(event) =>
													handleToggleMaterialEmission(
														material,
														(event.currentTarget as HTMLInputElement).checked
													)}
											/>
											<span>Emits Light</span>
										</label>
										{#if material.emitsLight}
											<label class="material-inline-field">
												<span class="material-inline-label">Tint</span>
												<input
													class="material-color-input material-inline-color"
													type="color"
													value={rgbTupleToHex(material.lightTint)}
													onchange={(event) =>
														handleMaterialLightTintChange(
															material,
															(event.currentTarget as HTMLInputElement).value
														)}
												/>
											</label>
										{/if}
										<button
											class="material-card-delete"
											type="button"
											onclick={() => handleDeleteMaterial(material.id)}
										>
											Delete
										</button>
									</article>
								{/each}
							</div>
						</section>

						<section class="material-create-panel">
							<div class="material-create-head">
								<div class="material-create-kicker">Add Material</div>
								<div class="material-create-title">Forge A New Surface</div>
							</div>

							<div class="material-create-body">
								<label class="material-field">
									<span class="material-field-label">Material Name</span>
									<input
										class="material-input"
										type="text"
										maxlength="40"
										placeholder="Smoked Glass, Weathered Copper..."
										bind:value={newMaterialName}
									/>
								</label>

								<label class="material-field">
									<span class="material-field-label">Color</span>
									<div class="material-color-row">
										<input
											class="material-color-input"
											type="color"
											bind:value={newMaterialColor}
										/>
										<div
											class:material-swatch-emissive={newMaterialEmitsLight}
											class="material-preview-chip"
											style={`--material-color: ${newMaterialColor}; --material-opacity: ${clampOpacity(newMaterialOpacity / 100)}; --material-light-tint: ${newMaterialLightTint};`}
										></div>
									</div>
								</label>

								<label class="material-field">
									<span class="material-field-label">Opacity</span>
									<div class="material-opacity-row">
										<input
											class="material-range"
											type="range"
											min="0"
											max="100"
											step="1"
											bind:value={newMaterialOpacity}
										/>
										<input
											class="material-number"
											type="number"
											min="0"
											max="100"
											step="1"
											bind:value={newMaterialOpacity}
										/>
									</div>
								</label>

								<label class="material-toggle">
									<input type="checkbox" bind:checked={newMaterialIsWater} />
									<span class="material-toggle-copy">
										<span class="material-toggle-title">Water</span>
										<span class="material-toggle-note">
											Uses animated water shading and disables player collision.
										</span>
									</span>
								</label>

								<label class="material-toggle">
									<input type="checkbox" bind:checked={newMaterialEmitsLight} />
									<span class="material-toggle-copy">
										<span class="material-toggle-title">Emits Light</span>
										<span class="material-toggle-note">
											Nearby blocks of this material cast a tinted point light.
										</span>
									</span>
								</label>

								{#if newMaterialEmitsLight}
									<label class="material-field">
										<span class="material-field-label">Light Tint</span>
										<div class="material-color-row">
											<input
												class="material-color-input"
												type="color"
												bind:value={newMaterialLightTint}
											/>
											<div
												class="material-preview-chip material-preview-chip-light"
												style={`--material-color: ${newMaterialLightTint}; --material-opacity: 1; --material-light-tint: ${newMaterialLightTint};`}
											></div>
										</div>
									</label>
								{/if}
							</div>

							<button class="material-create-button" type="button" onclick={handleCreateMaterial}>
								Add Material
							</button>
						</section>
					</div>
				</div>
			</section>
		</div>
	{/if}

	{#if natureUiState.open}
		<div class="nature-overlay" role="dialog" aria-modal="true" aria-label="Nature Library">
			<button
				class="nature-overlay-backdrop"
				type="button"
				aria-label="Close nature library"
				onclick={handleCloseNaturePanel}
			></button>

			<section class="nature-panel">
				<header class="nature-panel-head">
					<div>
						<div class="nature-panel-kicker">Ground Cover And Canopy Kit</div>
						<h2 class="nature-panel-title">Nature</h2>
						<p class="nature-panel-copy">
							Paint sparse teardown-style grass, scatter colorful procedural flowers, or stamp a
							full tree with rough bark, upward branches, and layered leaf scatter.
						</p>
					</div>

					<div class="nature-panel-actions">
						<div class="nature-panel-note">
							{#if natureUiState.activeTool}
								{getNaturePresetTitle(natureUiState.activePreset ?? 'grass')} armed
							{:else}
								Select a preset, tune it, then start painting.
							{/if}
						</div>
						<button class="nature-close" type="button" onclick={handleCloseNaturePanel}>
							Close
						</button>
					</div>
				</header>

				<div class="nature-panel-body">
					<section class="nature-preset-panel">
						<div class="nature-preset-head">
							<div>
								<div class="nature-section-label">Starter Presets</div>
								<div class="nature-section-title">Ready To Paint</div>
							</div>
							<div class="nature-section-note">Every brush stroke writes plain world voxels.</div>
						</div>

						<div class="nature-card-grid">
							<article
								class:nature-card-active={natureUiState.activePreset === 'grass'}
								class="nature-card"
							>
								<button
									class="nature-card-main"
									type="button"
									onclick={() => handleSelectNaturePreset('grass')}
								>
									<div class="nature-card-art nature-card-art-grass" aria-hidden="true">
										<span class="nature-grass-blade nature-grass-blade-short"></span>
										<span class="nature-grass-blade nature-grass-blade-mid"></span>
										<span class="nature-grass-blade nature-grass-blade-tall"></span>
										<span class="nature-grass-blade nature-grass-blade-accent"></span>
									</div>
									<div class="nature-card-copy">
										<div class="nature-card-kicker">Brush Preset</div>
										<div class="nature-card-title">Grass</div>
										<p class="nature-card-text">
											Scatters short voxel tufts in broken-up patches with muted green variation and
											stepped blade heights.
										</p>
									</div>
								</button>
								<div class="nature-card-meta">
									<span>Ground only</span>
									<span>Soft circular falloff</span>
									<span>1-4 voxel tufts</span>
								</div>
								<button
									class="nature-card-activate"
									type="button"
									onclick={() => handleActivateNaturePreset('grass')}
								>
									Start Grass Brush
								</button>
							</article>

							<article
								class:nature-card-active={natureUiState.activePreset === 'trees'}
								class="nature-card"
							>
								<button
									class="nature-card-main"
									type="button"
									onclick={() => handleSelectNaturePreset('trees')}
								>
									<div class="nature-card-art nature-card-art-tree" aria-hidden="true">
										<span class="nature-tree-trunk"></span>
										<span class="nature-tree-leaf nature-tree-leaf-top"></span>
										<span class="nature-tree-leaf nature-tree-leaf-left"></span>
										<span class="nature-tree-leaf nature-tree-leaf-right"></span>
										<span class="nature-tree-leaf nature-tree-leaf-core"></span>
									</div>
									<div class="nature-card-copy">
										<div class="nature-card-kicker">Generator Preset</div>
										<div class="nature-card-title">Trees</div>
										<p class="nature-card-text">
											Places a full tree with bark roughness, upward-biased branches, and scattered
											leaf clusters for readable depth.
										</p>
									</div>
								</button>
								<div class="nature-card-meta">
									<span>Single-click place</span>
									<span>Rough bark tones</span>
									<span>Procedural canopy</span>
								</div>
								<button
									class="nature-card-activate"
									type="button"
									onclick={() => handleActivateNaturePreset('trees')}
								>
									Start Tree Tool
								</button>
							</article>

							<article
								class:nature-card-active={natureUiState.activePreset === 'flowers'}
								class="nature-card"
							>
								<button
									class="nature-card-main"
									type="button"
									onclick={() => handleSelectNaturePreset('flowers')}
								>
									<div class="nature-card-art nature-card-art-flowers" aria-hidden="true">
										<span class="nature-flower-stem nature-flower-stem-left"></span>
										<span class="nature-flower-stem nature-flower-stem-center"></span>
										<span class="nature-flower-stem nature-flower-stem-right"></span>
										<span class="nature-flower-bloom nature-flower-bloom-red"></span>
										<span class="nature-flower-bloom nature-flower-bloom-blue"></span>
										<span class="nature-flower-bloom nature-flower-bloom-orange"></span>
										<span class="nature-flower-bloom nature-flower-bloom-purple"></span>
									</div>
									<div class="nature-card-copy">
										<div class="nature-card-kicker">Brush Preset</div>
										<div class="nature-card-title">Flowers</div>
										<p class="nature-card-text">
											Plants low procedural flower clusters with colored blossoms in red, blue,
											orange, and purple over or through existing grass.
										</p>
									</div>
								</button>
								<div class="nature-card-meta">
									<span>Painted clusters</span>
									<span>Colored blossoms</span>
									<span>Grass-friendly</span>
								</div>
								<button
									class="nature-card-activate"
									type="button"
									onclick={() => handleActivateNaturePreset('flowers')}
								>
									Start Flower Brush
								</button>
							</article>
						</div>
					</section>

					<section class="nature-settings-panel">
						<div class="nature-settings-head">
							<div>
								<div class="nature-section-label">Tuning</div>
								<div class="nature-section-title">
									{getNaturePresetTitle(natureUiState.activePreset ?? 'grass')}
								</div>
							</div>
							<div class="nature-settings-badge">
								{natureUiState.activePreset === 'grass'
									? 'Patch painter'
									: natureUiState.activePreset === 'flowers'
										? 'Bloom scatter'
										: 'Procedural stamp'}
							</div>
						</div>

						{#if natureUiState.activePreset === 'grass'}
							{@const grassSettings = natureUiState.grassSettings}
							{@const activeVariance =
								grassVarianceOptions.find(
									(option) => option.value === grassSettings.heightVariance
								) ?? grassVarianceOptions[1]}

							<div class="nature-settings-body">
								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Brush Radius</span>
										<span class="nature-field-value">{grassSettings.radius}</span>
									</div>
									<input
										class="nature-range"
										type="range"
										min="1"
										max="10"
										step="1"
										value={grassSettings.radius}
										oninput={(event) =>
											handleNatureGrassRadiusChange(
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Patch Density</span>
										<span class="nature-field-value">
											{formatNatureDensity(grassSettings.density)}
										</span>
									</div>
									<input
										class="nature-range"
										type="range"
										min="0.05"
										max="1"
										step="0.01"
										value={grassSettings.density}
										oninput={(event) =>
											handleNatureGrassDensityChange(
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<div class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Height Spread</span>
										<span class="nature-field-value">{activeVariance.label}</span>
									</div>
									<div class="nature-segmented">
										{#each grassVarianceOptions as option (option.value)}
											<button
												class:nature-segment-active={option.value === grassSettings.heightVariance}
												class="nature-segment"
												type="button"
												onclick={() => handleNatureGrassVarianceChange(option.value)}
											>
												{option.label}
											</button>
										{/each}
									</div>
									<div class="nature-helper-copy">{activeVariance.copy}</div>
								</div>

								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Seed Offset</span>
										<span class="nature-field-value">{grassSettings.seedOffset}</span>
									</div>
									<input
										class="nature-number"
										type="number"
										min="0"
										max="9999"
										step="1"
										value={grassSettings.seedOffset}
										oninput={(event) =>
											handleNatureGrassSeedChange((event.currentTarget as HTMLInputElement).value)}
									/>
								</label>

								<div class="nature-summary">
									The brush only fills empty cells above exposed ground. Repainting refreshes
									existing grass voxels without carving into terrain.
								</div>
							</div>
						{:else if natureUiState.activePreset === 'flowers'}
							{@const flowerSettings = natureUiState.flowerSettings}

							<div class="nature-settings-body">
								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Brush Radius</span>
										<span class="nature-field-value">{flowerSettings.radius}</span>
									</div>
									<input
										class="nature-range"
										type="range"
										min="1"
										max="10"
										step="1"
										value={flowerSettings.radius}
										oninput={(event) =>
											handleNatureFlowerRadiusChange(
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Bloom Density</span>
										<span class="nature-field-value">
											{formatNatureDensity(flowerSettings.density)}
										</span>
									</div>
									<input
										class="nature-range"
										type="range"
										min="0.05"
										max="1"
										step="0.01"
										value={flowerSettings.density}
										oninput={(event) =>
											handleNatureFlowerDensityChange(
												(event.currentTarget as HTMLInputElement).value
											)}
									/>
								</label>

								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Seed Offset</span>
										<span class="nature-field-value">{flowerSettings.seedOffset}</span>
									</div>
									<input
										class="nature-number"
										type="number"
										min="0"
										max="9999"
										step="1"
										value={flowerSettings.seedOffset}
										oninput={(event) =>
											handleNatureFlowerSeedChange((event.currentTarget as HTMLInputElement).value)}
									/>
								</label>

								<div class="nature-summary">
									Flowers repaint their own stems and blossoms cleanly, and they can grow through
									grass while leaving the surrounding ground untouched.
								</div>
							</div>
						{:else}
							{@const treeSettings = natureUiState.treeSettings}
							{@const activeTreeSize =
								treeSizeOptions.find((option) => option.value === treeSettings.size) ??
								treeSizeOptions[1]}

							<div class="nature-settings-body">
								<div class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Tree Size</span>
										<span class="nature-field-value">{activeTreeSize.label}</span>
									</div>
									<div class="nature-segmented">
										{#each treeSizeOptions as option (option.value)}
											<button
												class:nature-segment-active={option.value === treeSettings.size}
												class="nature-segment"
												type="button"
												onclick={() => handleNatureTreeSizeChange(option.value)}
											>
												{option.label}
											</button>
										{/each}
									</div>
									<div class="nature-helper-copy">{activeTreeSize.copy}</div>
								</div>

								<label class="nature-field">
									<div class="nature-field-row">
										<span class="nature-field-label">Seed Offset</span>
										<span class="nature-field-value">{treeSettings.seedOffset}</span>
									</div>
									<input
										class="nature-number"
										type="number"
										min="0"
										max="9999"
										step="1"
										value={treeSettings.seedOffset}
										oninput={(event) =>
											handleNatureTreeSeedChange((event.currentTarget as HTMLInputElement).value)}
									/>
								</label>

								<div class="nature-summary">
									Trees stamp a connected trunk, upward branches, and irregular leaf clusters. If
									the volume would collide with existing structures, placement is skipped.
								</div>
							</div>
						{/if}

						<div class="nature-settings-actions">
							<button
								class="nature-apply"
								type="button"
								onclick={() => handleActivateNaturePreset(natureUiState.activePreset ?? 'grass')}
							>
								{natureUiState.activePreset === 'grass'
									? 'Use Grass Brush'
									: natureUiState.activePreset === 'flowers'
										? 'Use Flower Brush'
										: 'Use Tree Tool'}
							</button>
						</div>
					</section>
				</div>
			</section>
		</div>
	{/if}

	{#if propUiState.managerOpen}
		<div class="prop-overlay" role="dialog" aria-modal="true" aria-label="Prop Library">
			<button
				class="prop-overlay-backdrop"
				type="button"
				aria-label="Close prop library"
				onclick={handleClosePropManager}
			></button>

			<section class="prop-panel">
				<header class="prop-panel-head">
					<div>
						<div class="prop-panel-kicker">Selection To Reusable Kit</div>
						<h2 class="prop-panel-title">Prop Archive</h2>
						<p class="prop-panel-copy">
							Capture voxel groups as reusable props, mark them for future interaction hooks, then
							stamp new copies back into the world.
						</p>
					</div>

					<div class="prop-panel-actions">
						<div class="prop-panel-note">
							Selection holds {selectedPropBlockCount} block{selectedPropBlockCount === 1
								? ''
								: 's'}
						</div>
						<button class="prop-close" type="button" onclick={handleClosePropManager}>
							Close
						</button>
					</div>
				</header>

				<div class="prop-panel-body">
					<section class="prop-capture-panel">
						<div class="prop-capture-head">
							<div>
								<div class="prop-capture-kicker">Capture From Selection</div>
								<div class="prop-capture-title">Forge A Reusable Prop</div>
							</div>
							<div class="prop-selection-count">{selectedPropBlockCount} selected</div>
						</div>

						<label class="prop-field">
							<span class="prop-field-label">Prop Name</span>
							<input
								class="prop-input"
								type="text"
								maxlength="48"
								placeholder="Shop Stall, Street Lamp, Rooftop Unit..."
								bind:value={newPropName}
							/>
						</label>

						<label class="prop-toggle">
							<input type="checkbox" bind:checked={newPropInteractable} />
							<span class="prop-toggle-copy">
								<span class="prop-toggle-title">Interactable</span>
								<span class="prop-toggle-note">
									Stored on the prop definition for later gameplay hooks.
								</span>
							</span>
						</label>

						<button
							class="prop-create-button"
							type="button"
							disabled={selectedPropBlockCount === 0}
							onclick={handleCreateProp}
						>
							Save Prop
						</button>
					</section>

					<section class="prop-grid-panel">
						<div class="prop-grid-head">
							<div>
								<div class="prop-grid-title">Saved Props</div>
								<div class="prop-grid-subtitle">{getProps().length} definitions loaded</div>
							</div>
							<div class="prop-grid-note">
								Spawn enters hologram placement mode with `W` translate and `E` rotate.
							</div>
						</div>

						<div class="prop-grid">
							{#each getProps() as prop (prop.id)}
								<article class="prop-card">
									<div class="prop-card-head">
										<div>
											<div class="prop-card-name">{prop.name}</div>
											<div class="prop-card-id">Prop {prop.id}</div>
										</div>
										<div class:prop-chip-live={prop.interactable} class="prop-chip">
											{prop.interactable ? 'Interactable' : 'Static'}
										</div>
									</div>

									<div class="prop-card-meta">
										<span>{prop.blocks.length} block{prop.blocks.length === 1 ? '' : 's'}</span>
										<span>
											{prop.bounds.max.x - prop.bounds.min.x + 1} x
											{prop.bounds.max.y - prop.bounds.min.y + 1} x
											{prop.bounds.max.z - prop.bounds.min.z + 1}
										</span>
									</div>

									<div class="prop-card-actions">
										<button
											class="prop-card-spawn"
											type="button"
											onclick={() => handleSpawnProp(prop.id)}
										>
											Spawn
										</button>
										<button
											class="prop-card-delete"
											type="button"
											onclick={() => handleDeleteProp(prop.id)}
										>
											Delete
										</button>
									</div>
								</article>
							{/each}
						</div>
					</section>
				</div>
			</section>
		</div>
	{/if}

	{#if natureUiState.activeTool && !natureUiState.open && !propUiState.placementActive}
		<div class="nature-tool-banner">
			<div class="nature-tool-chip">Nature Live</div>
			<div class="nature-tool-title">{getNatureToolTitle()}</div>
			<div class="nature-tool-row">
				{#if natureUiState.activeTool === 'tree-place'}
					<span class="keycap">LMB</span>
					<span class="dock-copy">Plant</span>
				{:else}
					<span class="keycap">LMB Drag</span>
					<span class="dock-copy">Paint</span>
				{/if}
				<span class="keycap">N</span>
				<span class="dock-copy">Tune</span>
				<span class="keycap">Esc</span>
				<span class="dock-copy">Cancel</span>
			</div>
		</div>
	{/if}

	{#if propUiState.placementActive}
		<div class="prop-placement-banner">
			<div class="prop-placement-kicker">Placement Live</div>
			<div class="prop-placement-title">{propUiState.placementPropName ?? 'Prop'} hologram</div>
			<div class="prop-placement-row">
				<span class="keycap">W</span>
				<span class="dock-copy">Translate</span>
				<span class="keycap">E</span>
				<span class="dock-copy">Rotate</span>
				<span class="keycap">Enter</span>
				<span class="dock-copy">Place</span>
				<span class="keycap">Esc</span>
				<span class="dock-copy">Cancel</span>
			</div>
		</div>
	{/if}
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
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		width: min(980px, calc(100vw - 32px));
		padding: 8px;
		transform: translateX(-50%);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 22px;
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
		padding: 10px 12px;
		border-radius: 16px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
		min-width: 0;
	}

	.dock-section-tip {
		background:
			linear-gradient(180deg, rgba(116, 255, 216, 0.12), rgba(62, 202, 252, 0.08)),
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
	}

	.dock-label {
		margin-bottom: 6px;
		color: rgba(217, 240, 233, 0.68);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.dock-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 0.74rem;
		line-height: 1.25;
		min-width: 0;
	}

	.dock-row-tip {
		color: #f2fffb;
	}

	.keycap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 24px;
		padding: 0 8px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 9px;
		background: rgba(240, 251, 248, 0.1);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.dock-copy {
		color: rgba(232, 245, 241, 0.84);
		white-space: nowrap;
	}

	.material-overlay {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		padding: 22px;
	}

	.material-overlay-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background:
			linear-gradient(180deg, rgba(3, 9, 13, 0.44), rgba(3, 9, 13, 0.72)),
			radial-gradient(circle at top, rgba(64, 238, 202, 0.12), transparent 40%);
		backdrop-filter: blur(16px);
		cursor: pointer;
	}

	.material-panel {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 18px;
		width: min(1180px, calc(100vw - 32px));
		max-height: min(860px, calc(100vh - 44px));
		padding: 20px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 30px;
		background:
			linear-gradient(180deg, rgba(9, 18, 23, 0.92), rgba(9, 18, 23, 0.78)),
			radial-gradient(circle at top left, rgba(64, 238, 202, 0.12), transparent 42%),
			radial-gradient(circle at bottom right, rgba(33, 117, 255, 0.18), transparent 40%);
		box-shadow:
			0 36px 90px rgba(3, 8, 12, 0.5),
			inset 0 1px 0 rgba(255, 255, 255, 0.14);
		color: #eef9f6;
		overflow: hidden;
	}

	.material-panel::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px);
		background-size: 28px 28px;
		mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8), transparent 85%);
		pointer-events: none;
	}

	.material-panel-head,
	.material-panel-body,
	.material-slots,
	.material-workbench {
		position: relative;
		z-index: 1;
	}

	.material-panel-body {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 18px;
		min-height: 0;
		overflow: auto;
		padding-right: 8px;
		margin-right: -8px;
		scrollbar-gutter: stable;
	}

	.material-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.material-panel-kicker,
	.material-create-kicker {
		color: rgba(188, 221, 214, 0.68);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.material-panel-title,
	.material-create-title {
		margin: 6px 0 0;
		font-size: clamp(1.8rem, 2.6vw, 2.6rem);
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.material-panel-copy {
		margin: 10px 0 0;
		max-width: 42rem;
		color: rgba(219, 238, 232, 0.76);
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.material-panel-actions {
		display: grid;
		gap: 10px;
		justify-items: end;
	}

	.material-panel-note {
		padding: 10px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(229, 245, 240, 0.78);
		font-size: 0.78rem;
	}

	.material-close,
	.material-create-button,
	.material-slot-clear,
	.material-card-delete {
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 12px;
		background:
			linear-gradient(180deg, rgba(241, 251, 248, 0.12), rgba(241, 251, 248, 0.04)),
			radial-gradient(circle at top, rgba(116, 255, 216, 0.14), transparent 52%);
		color: #f1fbf8;
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

	.material-close,
	.material-create-button {
		padding: 12px 16px;
	}

	.material-slot-clear,
	.material-card-delete {
		padding: 6px 8px;
		font-size: 0.7rem;
	}

	.material-close:hover,
	.material-create-button:hover,
	.material-slot-clear:hover,
	.material-card-delete:hover {
		border-color: rgba(116, 255, 216, 0.42);
		transform: translateY(-1px);
	}

	.material-slots {
		display: grid;
		grid-template-columns: repeat(9, minmax(0, 1fr));
		gap: 8px;
	}

	.material-slot {
		display: grid;
		gap: 8px;
		padding: 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at top, rgba(64, 238, 202, 0.08), transparent 48%);
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.material-slot:hover,
	.material-slot-active {
		border-color: rgba(116, 255, 216, 0.42);
		transform: translateY(-1px);
		box-shadow: 0 12px 30px rgba(10, 20, 24, 0.24);
	}

	.material-slot-drop-target {
		border-color: rgba(116, 255, 216, 0.78);
		background:
			linear-gradient(180deg, rgba(116, 255, 216, 0.16), rgba(62, 202, 252, 0.1)),
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at top, rgba(64, 238, 202, 0.08), transparent 48%);
		box-shadow:
			0 0 0 1px rgba(116, 255, 216, 0.3),
			0 16px 34px rgba(10, 20, 24, 0.32);
	}

	.material-slot-index {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		font-size: 0.72rem;
		font-weight: 800;
	}

	.material-slot-main {
		display: grid;
		gap: 8px;
		min-height: 84px;
		align-content: start;
	}

	.material-slot-swatch,
	.material-card-swatch,
	.material-preview-chip {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background:
			linear-gradient(
				45deg,
				rgba(255, 255, 255, 0.06) 25%,
				transparent 25%,
				transparent 75%,
				rgba(255, 255, 255, 0.06) 75%
			),
			linear-gradient(
				45deg,
				rgba(255, 255, 255, 0.06) 25%,
				transparent 25%,
				transparent 75%,
				rgba(255, 255, 255, 0.06) 75%
			),
			rgba(8, 18, 20, 0.8);
		background-position:
			0 0,
			9px 9px,
			0 0;
		background-size:
			18px 18px,
			18px 18px,
			auto;
	}

	.material-swatch-emissive::before,
	.material-preview-chip-light::before {
		content: '';
		position: absolute;
		inset: -16%;
		background: radial-gradient(circle, var(--material-light-tint), transparent 68%);
		opacity: 0.34;
		filter: blur(12px);
		pointer-events: none;
	}

	.material-slot-swatch::after,
	.material-card-swatch::after,
	.material-preview-chip::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(135deg, rgba(255, 255, 255, 0.26), transparent 48%), var(--material-color);
		opacity: var(--material-opacity);
	}

	.material-slot-swatch {
		height: 34px;
	}

	.material-slot-meta {
		display: grid;
		gap: 2px;
		align-content: start;
	}

	.material-slot-name {
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1.15;
	}

	.material-slot-opacity,
	.material-grid-subtitle,
	.material-card-meta,
	.material-slot-empty {
		color: rgba(217, 237, 230, 0.66);
		font-size: 0.68rem;
	}

	.material-badge-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-height: 18px;
	}

	.material-slot-empty {
		align-self: center;
	}

	.material-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px 8px;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.material-badge-light {
		background: rgba(255, 214, 122, 0.16);
		color: #ffe7a1;
		box-shadow: 0 0 18px rgba(255, 206, 116, 0.14);
	}

	.material-badge-water {
		background: rgba(103, 202, 255, 0.16);
		color: #bfefff;
		box-shadow: 0 0 18px rgba(84, 198, 255, 0.12);
	}

	.material-workbench {
		display: grid;
		grid-template-columns: minmax(0, 2.3fr) minmax(280px, 0.95fr);
		gap: 18px;
		min-height: 0;
		overflow: hidden;
	}

	.material-grid-panel,
	.material-create-panel {
		display: grid;
		gap: 16px;
		padding: 18px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at top right, rgba(64, 238, 202, 0.08), transparent 40%);
		min-height: 0;
	}

	.material-grid-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
		min-width: 0;
	}

	.material-grid-title {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.material-grid-note {
		max-width: 15rem;
		color: rgba(217, 237, 230, 0.66);
		font-size: 0.74rem;
		line-height: 1.45;
		text-align: right;
	}

	.material-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
		gap: 10px;
		overflow: auto;
		padding-right: 4px;
	}

	.material-card {
		display: grid;
		gap: 8px;
		padding: 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at bottom right, rgba(33, 117, 255, 0.12), transparent 40%);
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.material-card-selected {
		border-color: rgba(116, 255, 216, 0.44);
		box-shadow: 0 16px 34px rgba(10, 18, 24, 0.24);
	}

	.material-card-dragging {
		opacity: 0.52;
		transform: scale(0.98);
	}

	.material-card-hit {
		display: grid;
		gap: 8px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.material-card-swatch {
		height: 76px;
	}

	.material-card-copy {
		display: grid;
		gap: 4px;
	}

	.material-card-name-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.material-card-name {
		font-size: 0.84rem;
		font-weight: 700;
		line-height: 1.15;
	}

	.material-card-meta {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}

	.material-inline-toggle,
	.material-toggle {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: start;
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.04);
	}

	.material-inline-toggle {
		padding: 10px 12px;
		font-size: 0.74rem;
		font-weight: 700;
	}

	.material-inline-toggle input,
	.material-toggle input {
		margin-top: 2px;
		accent-color: #ffd67a;
	}

	.material-toggle-copy {
		display: grid;
		gap: 4px;
	}

	.material-toggle-title {
		font-size: 0.84rem;
		font-weight: 700;
	}

	.material-toggle-note {
		color: rgba(217, 237, 230, 0.7);
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.material-inline-field {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 2px;
	}

	.material-inline-label {
		color: rgba(217, 237, 230, 0.7);
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.material-inline-color {
		width: 44px;
		height: 38px;
		border-radius: 12px;
	}

	.material-create-panel {
		grid-template-rows: auto minmax(0, 1fr) auto;
		min-width: 0;
		overflow: hidden;
	}

	.material-create-body {
		display: grid;
		gap: 16px;
		min-height: 0;
		overflow: auto;
		padding-right: 6px;
		margin-right: -6px;
	}

	.material-field {
		display: grid;
		gap: 8px;
		min-width: 0;
	}

	.material-field-label {
		color: rgba(218, 236, 230, 0.72);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.material-input,
	.material-number {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(5, 13, 17, 0.58);
		color: #eff9f7;
		font: inherit;
	}

	.material-input::placeholder {
		color: rgba(219, 236, 230, 0.36);
	}

	.material-color-row,
	.material-opacity-row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 12px;
		align-items: center;
		min-width: 0;
	}

	.material-opacity-row {
		grid-template-columns: minmax(0, 1fr) 92px;
	}

	.material-color-input {
		box-sizing: border-box;
		width: 56px;
		height: 48px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(5, 13, 17, 0.58);
		cursor: pointer;
	}

	.material-preview-chip {
		height: 48px;
	}

	.material-range {
		min-width: 0;
		width: 100%;
		accent-color: #74ffd8;
	}

	.material-create-title {
		overflow-wrap: anywhere;
	}

	.nature-overlay {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		padding: 22px;
	}

	.nature-overlay-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background:
			linear-gradient(180deg, rgba(8, 12, 9, 0.48), rgba(8, 12, 9, 0.78)),
			radial-gradient(circle at top, rgba(174, 214, 116, 0.13), transparent 38%),
			radial-gradient(circle at bottom right, rgba(173, 118, 62, 0.12), transparent 34%);
		backdrop-filter: blur(18px);
		cursor: pointer;
	}

	.nature-panel {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 18px;
		width: min(1160px, calc(100vw - 32px));
		max-height: min(860px, calc(100vh - 44px));
		padding: 20px;
		border: 1px solid rgba(231, 245, 219, 0.16);
		border-radius: 30px;
		background:
			linear-gradient(180deg, rgba(16, 25, 17, 0.94), rgba(16, 25, 17, 0.82)),
			radial-gradient(circle at top left, rgba(133, 194, 94, 0.14), transparent 42%),
			radial-gradient(circle at bottom right, rgba(162, 105, 62, 0.14), transparent 38%);
		box-shadow:
			0 36px 90px rgba(4, 8, 5, 0.6),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		color: #eef6ea;
		overflow: hidden;
	}

	.nature-panel::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
			linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px);
		background-size: 30px 30px;
		mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.86), transparent 88%);
		pointer-events: none;
	}

	.nature-panel-head,
	.nature-panel-body,
	.nature-preset-panel,
	.nature-settings-panel {
		position: relative;
		z-index: 1;
	}

	.nature-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.nature-panel-kicker,
	.nature-card-kicker,
	.nature-section-label {
		color: rgba(202, 223, 174, 0.72);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.nature-panel-title {
		margin: 6px 0 0;
		font-size: clamp(1.9rem, 2.8vw, 2.7rem);
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.nature-panel-copy {
		margin: 10px 0 0;
		max-width: 44rem;
		color: rgba(226, 236, 220, 0.78);
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.nature-panel-actions {
		display: grid;
		gap: 10px;
		justify-items: end;
	}

	.nature-panel-note,
	.nature-settings-badge {
		padding: 10px 14px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(234, 241, 225, 0.8);
		font-size: 0.78rem;
	}

	.nature-close,
	.nature-card-activate,
	.nature-apply {
		border: 1px solid rgba(231, 245, 219, 0.16);
		border-radius: 12px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
			radial-gradient(circle at top, rgba(162, 209, 109, 0.18), transparent 56%);
		color: #f3f8ee;
		font: inherit;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			opacity 140ms ease;
	}

	.nature-close,
	.nature-apply {
		padding: 12px 16px;
	}

	.nature-card-activate {
		padding: 10px 12px;
	}

	.nature-close:hover,
	.nature-card-activate:hover,
	.nature-apply:hover {
		border-color: rgba(185, 223, 126, 0.5);
		transform: translateY(-1px);
	}

	.nature-panel-body {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) minmax(310px, 0.92fr);
		gap: 18px;
		min-height: 0;
		overflow: auto;
		padding-right: 8px;
		margin-right: -8px;
		scrollbar-gutter: stable;
	}

	.nature-preset-panel,
	.nature-settings-panel {
		display: grid;
		gap: 16px;
		min-height: 0;
		padding: 18px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 24px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at top right, rgba(170, 222, 112, 0.08), transparent 42%);
	}

	.nature-preset-head,
	.nature-settings-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.nature-section-title {
		margin-top: 6px;
		font-size: 1.08rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.nature-section-note {
		max-width: 15rem;
		color: rgba(224, 236, 215, 0.66);
		font-size: 0.74rem;
		line-height: 1.45;
		text-align: right;
	}

	.nature-card-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
		min-height: 0;
	}

	.nature-card {
		display: grid;
		gap: 12px;
		padding: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 22px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at bottom right, rgba(121, 186, 95, 0.12), transparent 42%);
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.nature-card-active {
		border-color: rgba(184, 226, 124, 0.42);
		box-shadow: 0 18px 36px rgba(7, 12, 8, 0.28);
	}

	.nature-card-main {
		display: grid;
		gap: 12px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.nature-card-art {
		position: relative;
		min-height: 148px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		overflow: hidden;
		background:
			linear-gradient(180deg, rgba(199, 223, 199, 0.08), rgba(19, 26, 18, 0.2)),
			radial-gradient(circle at 50% 20%, rgba(209, 230, 185, 0.24), transparent 42%),
			linear-gradient(180deg, rgba(20, 35, 20, 0.82), rgba(10, 17, 11, 0.92));
	}

	.nature-card-art::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: 40%;
		background:
			linear-gradient(180deg, rgba(112, 86, 58, 0), rgba(112, 86, 58, 0.56)),
			linear-gradient(0deg, rgba(63, 48, 31, 0.82), rgba(63, 48, 31, 0.28));
	}

	.nature-card-art-grass::before {
		content: '';
		position: absolute;
		inset: auto 0 18px;
		height: 22px;
		background:
			radial-gradient(circle at 20% 50%, rgba(127, 168, 88, 0.6), transparent 38%),
			radial-gradient(circle at 54% 50%, rgba(89, 129, 58, 0.66), transparent 38%),
			radial-gradient(circle at 82% 50%, rgba(149, 194, 99, 0.62), transparent 38%);
		filter: blur(8px);
	}

	.nature-grass-blade {
		position: absolute;
		bottom: 34px;
		width: 16px;
		border-radius: 14px 14px 3px 3px;
		background: linear-gradient(180deg, rgba(181, 214, 120, 0.92), rgba(78, 119, 50, 0.98));
		box-shadow: 0 0 18px rgba(103, 152, 66, 0.18);
	}

	.nature-grass-blade-short {
		left: 16%;
		height: 42px;
		transform: rotate(-9deg);
	}

	.nature-grass-blade-mid {
		left: 34%;
		height: 58px;
		transform: rotate(4deg);
	}

	.nature-grass-blade-tall {
		left: 54%;
		height: 76px;
		transform: rotate(-4deg);
	}

	.nature-grass-blade-accent {
		left: 72%;
		height: 50px;
		background: linear-gradient(180deg, rgba(197, 227, 137, 0.94), rgba(104, 145, 60, 0.98));
		transform: rotate(10deg);
	}

	.nature-tree-trunk {
		position: absolute;
		left: calc(50% - 11px);
		bottom: 30px;
		width: 22px;
		height: 76px;
		border-radius: 7px;
		background:
			linear-gradient(90deg, rgba(78, 54, 35, 0.88), rgba(124, 91, 57, 0.98)),
			linear-gradient(180deg, rgba(62, 41, 25, 0.86), rgba(104, 73, 45, 0.96));
		box-shadow: inset -5px 0 0 rgba(49, 31, 18, 0.28);
	}

	.nature-tree-trunk::before,
	.nature-tree-trunk::after {
		content: '';
		position: absolute;
		border-radius: 5px;
		background: rgba(53, 36, 23, 0.84);
	}

	.nature-tree-trunk::before {
		left: -8px;
		top: 18px;
		width: 8px;
		height: 18px;
	}

	.nature-tree-trunk::after {
		right: -6px;
		top: 36px;
		width: 6px;
		height: 16px;
	}

	.nature-tree-leaf {
		position: absolute;
		border-radius: 18px;
		background: linear-gradient(180deg, rgba(135, 176, 87, 0.92), rgba(63, 102, 43, 0.98));
		box-shadow: 0 0 20px rgba(93, 145, 61, 0.18);
	}

	.nature-tree-leaf-top {
		left: calc(50% - 28px);
		top: 22px;
		width: 56px;
		height: 42px;
	}

	.nature-tree-leaf-left {
		left: 20%;
		top: 50px;
		width: 50px;
		height: 38px;
	}

	.nature-tree-leaf-right {
		right: 18%;
		top: 58px;
		width: 48px;
		height: 36px;
	}

	.nature-tree-leaf-core {
		left: calc(50% - 36px);
		top: 56px;
		width: 72px;
		height: 50px;
		background: linear-gradient(180deg, rgba(154, 195, 96, 0.94), rgba(69, 108, 46, 0.98));
	}

	.nature-card-art-flowers::before {
		content: '';
		position: absolute;
		inset: auto 0 18px;
		height: 20px;
		background:
			radial-gradient(circle at 24% 50%, rgba(97, 146, 67, 0.54), transparent 38%),
			radial-gradient(circle at 50% 50%, rgba(110, 163, 73, 0.58), transparent 38%),
			radial-gradient(circle at 78% 50%, rgba(88, 132, 60, 0.54), transparent 38%);
		filter: blur(7px);
	}

	.nature-flower-stem {
		position: absolute;
		bottom: 34px;
		width: 8px;
		border-radius: 999px;
		background: linear-gradient(180deg, rgba(126, 182, 88, 0.96), rgba(54, 104, 39, 0.98));
		box-shadow: 0 0 14px rgba(76, 136, 54, 0.16);
	}

	.nature-flower-stem-left {
		left: 26%;
		height: 48px;
		transform: rotate(-7deg);
	}

	.nature-flower-stem-center {
		left: calc(50% - 4px);
		height: 66px;
	}

	.nature-flower-stem-right {
		right: 28%;
		height: 54px;
		transform: rotate(7deg);
	}

	.nature-flower-bloom {
		position: absolute;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		box-shadow: 0 0 16px rgba(255, 255, 255, 0.08);
	}

	.nature-flower-bloom-red {
		left: 22%;
		top: 62px;
		background: radial-gradient(circle at 35% 35%, #ffccc5, #cb3e35 62%, #8e251f 100%);
	}

	.nature-flower-bloom-blue {
		left: calc(50% - 10px);
		top: 44px;
		background: radial-gradient(circle at 35% 35%, #d4e4ff, #4d76e3 62%, #24408a 100%);
	}

	.nature-flower-bloom-orange {
		right: 22%;
		top: 70px;
		background: radial-gradient(circle at 35% 35%, #ffe2c1, #e5882b 62%, #9b4f12 100%);
	}

	.nature-flower-bloom-purple {
		left: calc(50% + 18px);
		top: 82px;
		background: radial-gradient(circle at 35% 35%, #efd5ff, #8e53db 62%, #51207f 100%);
	}

	.nature-card-copy {
		display: grid;
		gap: 5px;
	}

	.nature-card-title {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.nature-card-text,
	.nature-helper-copy,
	.nature-summary {
		margin: 0;
		color: rgba(226, 237, 220, 0.72);
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.nature-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.nature-card-meta span {
		padding: 7px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(236, 243, 230, 0.76);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.nature-settings-panel {
		grid-template-rows: auto minmax(0, 1fr) auto;
	}

	.nature-settings-body {
		display: grid;
		gap: 16px;
		align-content: start;
		min-height: 0;
		overflow: auto;
		padding-right: 6px;
		margin-right: -6px;
	}

	.nature-field {
		display: grid;
		gap: 10px;
	}

	.nature-field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.nature-field-label {
		color: rgba(222, 236, 213, 0.72);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.nature-field-value {
		color: #f3f7ef;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.nature-range,
	.nature-number {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
	}

	.nature-range {
		accent-color: #a7db65;
	}

	.nature-number {
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(8, 14, 9, 0.52);
		color: #f1f6ee;
		font: inherit;
	}

	.nature-segmented {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.nature-segment {
		padding: 10px 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.03);
		color: rgba(232, 241, 225, 0.84);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background-color 140ms ease,
			transform 140ms ease;
	}

	.nature-segment:hover {
		transform: translateY(-1px);
	}

	.nature-segment-active {
		border-color: rgba(188, 228, 131, 0.42);
		background:
			linear-gradient(180deg, rgba(195, 230, 142, 0.14), rgba(195, 230, 142, 0.04)),
			rgba(255, 255, 255, 0.03);
	}

	.nature-summary {
		padding: 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(163, 217, 101, 0.08), rgba(163, 217, 101, 0.03)),
			rgba(255, 255, 255, 0.02);
	}

	.nature-settings-actions {
		display: flex;
		justify-content: flex-end;
	}

	.nature-tool-banner {
		position: absolute;
		left: 50%;
		top: 92px;
		z-index: 3;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 10px;
		max-width: calc(100vw - 32px);
		padding: 10px 12px;
		transform: translateX(-50%);
		border: 1px solid rgba(221, 241, 204, 0.22);
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(16, 25, 17, 0.88), rgba(16, 25, 17, 0.68)),
			radial-gradient(circle at top, rgba(170, 219, 108, 0.16), transparent 44%);
		box-shadow:
			0 18px 40px rgba(6, 10, 6, 0.26),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(16px);
		color: #edf6ea;
		pointer-events: none;
	}

	.nature-tool-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px 9px;
		border: 1px solid rgba(221, 241, 204, 0.14);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(208, 230, 194, 0.74);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.nature-tool-title {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.nature-tool-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 7px;
		font-size: 0.74rem;
	}

	.prop-overlay {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		padding: 22px;
	}

	.prop-overlay-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background:
			linear-gradient(180deg, rgba(5, 8, 16, 0.5), rgba(5, 8, 16, 0.76)),
			radial-gradient(circle at top, rgba(255, 216, 74, 0.12), transparent 42%);
		backdrop-filter: blur(16px);
		cursor: pointer;
	}

	.prop-panel {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 18px;
		width: min(1120px, calc(100vw - 32px));
		max-height: min(860px, calc(100vh - 44px));
		padding: 20px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 30px;
		background:
			linear-gradient(180deg, rgba(17, 18, 25, 0.92), rgba(17, 18, 25, 0.8)),
			radial-gradient(circle at top left, rgba(255, 216, 74, 0.14), transparent 40%),
			radial-gradient(circle at bottom right, rgba(95, 240, 255, 0.14), transparent 42%);
		box-shadow:
			0 36px 90px rgba(3, 8, 12, 0.56),
			inset 0 1px 0 rgba(255, 255, 255, 0.14);
		color: #f4f7ff;
		overflow: hidden;
	}

	.prop-panel::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
		background-size: 28px 28px;
		mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.88), transparent 85%);
		pointer-events: none;
	}

	.prop-panel-head,
	.prop-panel-body,
	.prop-capture-panel,
	.prop-grid-panel {
		position: relative;
		z-index: 1;
	}

	.prop-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.prop-panel-kicker,
	.prop-capture-kicker {
		color: rgba(234, 225, 181, 0.7);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.prop-panel-title,
	.prop-capture-title {
		margin: 6px 0 0;
		font-size: clamp(1.8rem, 2.6vw, 2.55rem);
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.prop-panel-copy {
		margin: 10px 0 0;
		max-width: 42rem;
		color: rgba(225, 228, 240, 0.78);
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.prop-panel-actions {
		display: grid;
		gap: 10px;
		justify-items: end;
	}

	.prop-panel-note {
		padding: 10px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(241, 242, 250, 0.8);
		font-size: 0.78rem;
	}

	.prop-close,
	.prop-create-button,
	.prop-card-spawn,
	.prop-card-delete {
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 12px;
		background:
			linear-gradient(180deg, rgba(255, 250, 233, 0.12), rgba(255, 250, 233, 0.04)),
			radial-gradient(circle at top, rgba(255, 216, 74, 0.14), transparent 52%);
		color: #f8fbff;
		font: inherit;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			background-color 140ms ease,
			opacity 140ms ease;
	}

	.prop-close,
	.prop-create-button {
		padding: 12px 16px;
	}

	.prop-card-spawn,
	.prop-card-delete {
		padding: 8px 10px;
	}

	.prop-close:hover,
	.prop-create-button:hover,
	.prop-card-spawn:hover,
	.prop-card-delete:hover {
		border-color: rgba(255, 216, 74, 0.44);
		transform: translateY(-1px);
	}

	.prop-create-button:disabled {
		opacity: 0.44;
		cursor: not-allowed;
		transform: none;
	}

	.prop-panel-body {
		display: grid;
		grid-template-columns: minmax(280px, 0.92fr) minmax(0, 1.5fr);
		gap: 18px;
		min-height: 0;
		overflow: auto;
		padding-right: 8px;
		margin-right: -8px;
		scrollbar-gutter: stable;
	}

	.prop-capture-panel,
	.prop-grid-panel {
		display: grid;
		gap: 16px;
		min-height: 0;
		padding: 18px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at top right, rgba(255, 216, 74, 0.08), transparent 40%);
	}

	.prop-capture-panel {
		align-content: start;
	}

	.prop-capture-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.prop-selection-count {
		padding: 8px 12px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.06);
		color: rgba(241, 242, 250, 0.84);
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.prop-field {
		display: grid;
		gap: 8px;
	}

	.prop-field-label {
		color: rgba(225, 228, 240, 0.72);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.prop-input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: 12px 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 14px;
		background: rgba(8, 10, 18, 0.62);
		color: #f5f8ff;
		font: inherit;
	}

	.prop-input::placeholder {
		color: rgba(233, 236, 244, 0.34);
	}

	.prop-toggle {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: start;
		padding: 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.04);
	}

	.prop-toggle input {
		margin-top: 2px;
		accent-color: #ffd84a;
	}

	.prop-toggle-copy {
		display: grid;
		gap: 4px;
	}

	.prop-toggle-title {
		font-size: 0.84rem;
		font-weight: 700;
	}

	.prop-toggle-note {
		color: rgba(225, 228, 240, 0.7);
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.prop-grid-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
		min-width: 0;
	}

	.prop-grid-title {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.prop-grid-subtitle,
	.prop-card-id,
	.prop-card-meta {
		color: rgba(225, 228, 240, 0.68);
		font-size: 0.72rem;
	}

	.prop-grid-note {
		max-width: 16rem;
		color: rgba(225, 228, 240, 0.68);
		font-size: 0.74rem;
		line-height: 1.45;
		text-align: right;
	}

	.prop-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
		overflow: auto;
		padding-right: 4px;
	}

	.prop-card {
		display: grid;
		gap: 12px;
		padding: 14px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 18px;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
			radial-gradient(circle at bottom right, rgba(95, 240, 255, 0.12), transparent 42%);
	}

	.prop-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.prop-card-name {
		font-size: 0.92rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.prop-chip {
		padding: 6px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.07);
		color: rgba(232, 235, 244, 0.74);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.prop-chip-live {
		background: rgba(255, 216, 74, 0.16);
		color: #fff2bc;
	}

	.prop-card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		line-height: 1.4;
	}

	.prop-card-actions {
		display: flex;
		gap: 8px;
	}

	.prop-placement-banner {
		position: absolute;
		left: 50%;
		top: 92px;
		z-index: 3;
		display: grid;
		gap: 10px;
		width: min(540px, calc(100vw - 32px));
		padding: 14px 16px;
		transform: translateX(-50%);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 22px;
		background:
			linear-gradient(180deg, rgba(11, 21, 28, 0.82), rgba(11, 21, 28, 0.62)),
			radial-gradient(circle at top, rgba(95, 240, 255, 0.14), transparent 44%);
		box-shadow:
			0 24px 54px rgba(8, 11, 13, 0.28),
			inset 0 1px 0 rgba(255, 255, 255, 0.14);
		backdrop-filter: blur(16px);
		color: #edf7f3;
		pointer-events: none;
	}

	.prop-placement-kicker {
		color: rgba(205, 231, 235, 0.72);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.prop-placement-title {
		font-size: 0.96rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.prop-placement-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
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

	@media (max-width: 1200px) {
		.material-slots {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 980px) {
		.control-dock {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.material-workbench {
			grid-template-columns: minmax(0, 1fr);
		}

		.nature-panel-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.nature-card-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.prop-panel-body {
			grid-template-columns: minmax(0, 1fr);
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

		.material-overlay {
			padding: 12px;
		}

		.nature-overlay {
			padding: 12px;
		}

		.prop-overlay {
			padding: 12px;
		}

		.material-panel {
			max-height: calc(100vh - 24px);
			padding: 16px;
		}

		.nature-panel {
			max-height: calc(100vh - 24px);
			padding: 16px;
		}

		.prop-panel {
			max-height: calc(100vh - 24px);
			padding: 16px;
		}

		.material-panel-head {
			grid-template-columns: minmax(0, 1fr);
		}

		.nature-panel-head,
		.nature-preset-head,
		.nature-settings-head {
			flex-direction: column;
			align-items: flex-start;
		}

		.prop-panel-head {
			grid-template-columns: minmax(0, 1fr);
		}

		.material-slots {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.prop-grid-head,
		.prop-capture-head {
			flex-direction: column;
			align-items: flex-start;
		}

		.prop-placement-banner {
			top: 88px;
		}

		.nature-tool-banner {
			top: 88px;
		}

		:global(.game-hud) {
			width: calc(100vw - 32px);
		}
	}
</style>
