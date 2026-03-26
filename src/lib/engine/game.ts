import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { EditorController } from '$lib/editor/editorController';
import { createChunkBoundsHelper, disposeDebugObject } from '$lib/debug/debugDraw';
import { DebugStats } from '$lib/debug/stats';
import { EmissiveLightManager } from '$lib/engine/emissiveLightManager';
import { InputState } from '$lib/engine/input';
import { FixedLoop } from '$lib/engine/loop';
import { applySceneTimeOfDay, createGameScene, type SceneBundle } from '$lib/engine/scene';
import {
	createVoxelSurfaceMaterial,
	syncVoxelSurfaceMaterial,
	type VoxelSurfaceMaterial
} from '$lib/engine/voxelSurfaceMaterial';
import { ensureNatureMaterials } from '$lib/nature/natureMaterials';
import type {
	NatureFlowerSettings,
	NatureGrassSettings,
	NaturePreset,
	NatureTreeSettings
} from '$lib/nature/natureTypes';
import { createVoxelWaterMaterial, type WaterShaderMaterial } from '$lib/engine/waterMaterial';
import {
	closeMaterialManager,
	getMaterialManagerUiState,
	openMaterialManager
} from '$lib/ui/materialManagerState';
import {
	clearNatureTool,
	closeNaturePanel,
	getNatureUiState,
	syncNatureTool,
	toggleNaturePanel,
	updateNatureFlowerSettings as updateNatureFlowerUiSettings,
	updateNatureGrassSettings as updateNatureGrassUiSettings,
	updateNatureTreeSettings as updateNatureTreeUiSettings
} from '$lib/ui/natureState';
import { closePropManager, getPropUiState, openPropManager } from '$lib/ui/propManagerState';
import { PlayerController } from '$lib/player/playerController';
import { ChunkMesh } from '$lib/voxel/chunkMesh';
import { DEFAULT_VOXEL_SIZE, VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import { buildDenseTestSlice } from '$lib/voxel/denseTestSlice';
import { buildChunkMesh } from '$lib/voxel/mesher';
import {
	createSerializedPropLibraryState,
	deletePropDefinition,
	getReferencedPropMaterialIds,
	hasPropMaterialReference,
	resetPropLibrary,
	restoreSerializedPropLibraryState,
	type SerializedPropLibraryState
} from '$lib/voxel/propLibrary';
import {
	assignMaterialToHotbar,
	createSerializedVoxelPaletteState,
	createVoxelMaterial,
	deleteVoxelMaterial,
	getVoxelPaletteEntry,
	pruneUnusedArchivedVoxelMaterials,
	resetVoxelPaletteToDefaults,
	restoreSerializedVoxelPaletteState,
	updateVoxelMaterialLighting,
	updateVoxelMaterialWater,
	type SerializedVoxelPaletteState
} from '$lib/voxel/voxelPalette';
import {
	clearSerializedWorldFromStorage,
	exportSerializedWorldToDisk,
	importSerializedWorldFromDisk,
	loadSerializedWorldFromStorage,
	saveSerializedWorldToStorage,
	type SerializedVoxelWorld
} from '$lib/voxel/worldPersistence';
import type { ChunkKey } from '$lib/voxel/voxelTypes';
import { VoxelWorld } from '$lib/voxel/world';

const SHOW_CHUNK_BOUNDS = false;
const ENABLE_DEV_WORLD_PERSISTENCE = import.meta.env.DEV;
const WORLD_SAVE_DEBOUNCE_MS = 300;
const BULK_CHUNK_SYNC_PER_FRAME = 2;
const BULK_CHUNK_SYNC_FRAME_BUDGET_MS = 2;
const BACKGROUND_SHADOW_REFRESH_INTERVAL_MS = 125;
const UNDO_IMMEDIATE_CHUNK_SYNC_LIMIT = 20;
const BLOOM_STRENGTH = 0.18;
const BLOOM_RADIUS = 0.45;
const BLOOM_THRESHOLD = 0.86;

export class Game {
	scene!: THREE.Scene;
	camera!: THREE.PerspectiveCamera;
	renderer!: THREE.WebGLRenderer;
	composer!: EffectComposer;

	world!: VoxelWorld;
	player!: PlayerController;
	editor!: EditorController;
	voxelRoot!: THREE.Group;

	chunkMeshes: Map<ChunkKey, ChunkMesh> = new Map();
	voxelOpaqueMaterial!: VoxelSurfaceMaterial;
	voxelTransparentMaterial!: VoxelSurfaceMaterial;
	voxelWaterMaterial!: WaterShaderMaterial;
	voxelGlowMaterial!: THREE.MeshBasicMaterial;
	bloomPass!: UnrealBloomPass;

	private readonly container: HTMLElement;
	private input!: InputState;
	private loop!: FixedLoop;
	private resizeObserver!: ResizeObserver;
	private stats!: DebugStats;
	private emissiveLightManager!: EmissiveLightManager;
	private sceneBundle!: SceneBundle;
	private readonly chunkBounds = new Map<ChunkKey, THREE.Object3D>();
	private readonly pendingChunkSyncKeys = new Set<ChunkKey>();
	private readonly backgroundChunkSyncKeySet = new Set<ChunkKey>();
	private backgroundChunkSyncQueue: ChunkKey[] = [];
	private backgroundChunkSyncIndex = 0;
	private nextBackgroundShadowRefreshAt = 0;
	private readonly waterSunDirection = new THREE.Vector3();
	private readonly waterSunPosition = new THREE.Vector3();
	private readonly waterSunTargetPosition = new THREE.Vector3();
	private lastDirtyChunkCount = 0;
	private autoSaveHandle: number | null = null;
	private materialManagerWasOpen = false;
	private naturePanelWasOpen = false;
	private propManagerWasOpen = false;
	private propPlacementWasActive = false;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	init(): void {
		this.sceneBundle = createGameScene();
		this.scene = this.sceneBundle.scene;
		this.voxelRoot = new THREE.Group();
		this.voxelRoot.scale.setScalar(VOXEL_WORLD_SIZE);
		this.scene.add(this.voxelRoot);
		this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.98;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		this.renderer.shadowMap.autoUpdate = false;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
		this.renderer.setClearColor('#c4d1d3');
		this.renderer.domElement.style.display = 'block';
		this.renderer.domElement.style.width = '100%';
		this.renderer.domElement.style.height = '100%';
		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(1, 1),
			BLOOM_STRENGTH,
			BLOOM_RADIUS,
			BLOOM_THRESHOLD
		);
		this.composer.addPass(this.bloomPass);

		this.container.style.position = 'relative';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.replaceChildren(this.renderer.domElement);

		this.input = new InputState(this.renderer.domElement);
		this.world = new VoxelWorld();
		this.voxelOpaqueMaterial = createVoxelSurfaceMaterial();
		this.voxelTransparentMaterial = createVoxelSurfaceMaterial({ transparent: true });
		this.voxelWaterMaterial = createVoxelWaterMaterial();
		this.voxelGlowMaterial = new THREE.MeshBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 1,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			toneMapped: false,
			fog: false
		});
		this.emissiveLightManager = new EmissiveLightManager(this.scene);
		this.player = new PlayerController(this.world, this.camera, this.input);
		this.editor = new EditorController(
			this.world,
			this.camera,
			this.input,
			this.voxelRoot,
			this.scene,
			this.renderer.domElement,
			this.player,
			(snapshot) => this.applyUndoSnapshot(snapshot)
		);
		this.stats = new DebugStats(this.container);

		closeMaterialManager();
		closeNaturePanel();
		closePropManager();
		clearNatureTool();
		this.loadInitialWorld();
		this.player.teleport(16 * DEFAULT_VOXEL_SIZE, 1 * DEFAULT_VOXEL_SIZE, 11 * DEFAULT_VOXEL_SIZE);
		this.player.setLookAngles(Math.PI, -0.05);
		this.updateViewportState();
		this.updateSize();

		this.resizeObserver = new ResizeObserver(() => {
			this.updateSize();
			this.render();
		});
		this.resizeObserver.observe(this.container);
		window.addEventListener('beforeunload', this.handleBeforeUnload);

		this.loop = new FixedLoop(
			(dt) => this.update(dt),
			() => this.render()
		);
		this.loop.start();
	}

	syncDirtyChunks(): void {
		this.pruneCleanChunkSyncKeys(this.pendingChunkSyncKeys);
		const immediateDirtyChunks = this.world.getDirtyChunks(this.pendingChunkSyncKeys);
		const processedImmediateCount = this.syncChunkMeshes(
			immediateDirtyChunks,
			this.pendingChunkSyncKeys
		);
		const processedBackgroundCount = this.syncBackgroundChunkMeshes();

		if (
			processedImmediateCount === 0 &&
			processedBackgroundCount === 0 &&
			this.pendingChunkSyncKeys.size === 0 &&
			this.backgroundChunkSyncKeySet.size === 0
		) {
			const fallbackDirtyChunks = this.world.getDirtyChunks();
			const processedFallbackCount = this.syncChunkMeshes(fallbackDirtyChunks, new Set<ChunkKey>());

			if (processedFallbackCount > 0) {
				this.invalidateShadows();
			}

			return;
		}

		if (processedImmediateCount + processedBackgroundCount > 0) {
			if (processedImmediateCount > 0) {
				this.invalidateShadows();
				return;
			}

			const backgroundWorkRemaining =
				this.backgroundChunkSyncKeySet.size > 0 || this.backgroundChunkSyncQueue.length > 0;

			if (!backgroundWorkRemaining || performance.now() >= this.nextBackgroundShadowRefreshAt) {
				this.invalidateShadows();
				this.nextBackgroundShadowRefreshAt =
					performance.now() + BACKGROUND_SHADOW_REFRESH_INTERVAL_MS;
			}
		}
	}

	update(dt: number): void {
		this.handleOverlayHotkeys();

		const materialManagerOpen = getMaterialManagerUiState().open;
		const propUiState = getPropUiState();
		const propManagerOpen = propUiState.managerOpen;
		const propPlacementActive = propUiState.placementActive;
		let changedChunkKeys = new Set<ChunkKey>();

		if (materialManagerOpen || propManagerOpen) {
			this.editor.resetTransientState();
		} else if (propPlacementActive) {
			this.player.update(dt);
			changedChunkKeys = this.editor.update();
			this.queueChunkSync(changedChunkKeys);
		} else {
			this.player.update(dt);
			changedChunkKeys = this.editor.update();
			this.queueChunkSync(changedChunkKeys);
		}

		if (changedChunkKeys.size > 0) {
			this.pruneUnusedArchivedMaterials();
			this.emissiveLightManager.invalidateCandidates();
		}

		this.scheduleWorldSave(changedChunkKeys.size > 0);

		this.updateViewportState();
		this.syncNatureToolState();
		this.lastDirtyChunkCount = this.pendingChunkSyncKeys.size + this.backgroundChunkSyncKeySet.size;
		this.syncDirtyChunks();
		this.emissiveLightManager.sync(this.world, this.camera.position);

		const hoveredChunk = this.editor.getHoveredChunkCoord();
		const selectedMaterial =
			getVoxelPaletteEntry(this.editor.getSelectedMaterialId())?.name ?? 'No Material';

		this.stats.update({
			position: this.player.position,
			onGround: this.player.onGround,
			pointerLocked: this.input.isPointerLocked(),
			targetedVoxel: this.editor.state.hoverHit,
			chunkCount: this.world.chunks.size,
			dirtyChunkCount: this.lastDirtyChunkCount,
			editorEnabled: this.editor.state.enabled,
			activeTool: this.editor.getToolLabel(),
			selectedMaterial,
			selectedSize: this.editor.state.selectedVoxelSize,
			mode: this.editor.state.mode,
			hoveredChunk
		});
	}

	render(): void {
		this.stats.recordFrame();
		this.syncRenderMaterialUniforms();
		this.composer.render();
	}

	dispose(): void {
		this.loop?.dispose();
		this.resizeObserver?.disconnect();
		window.removeEventListener('beforeunload', this.handleBeforeUnload);
		this.editor?.dispose();
		this.input?.dispose();
		this.stats?.dispose();
		this.clearScheduledWorldSave();

		this.clearRenderedWorld();
		this.scene.remove(this.voxelRoot);
		this.scene.remove(this.sceneBundle.skyDome);
		this.sceneBundle.skyDome.geometry.dispose();
		this.sceneBundle.skyDome.material.dispose();

		this.composer?.dispose();
		this.voxelOpaqueMaterial?.dispose();
		this.voxelTransparentMaterial?.dispose();
		this.voxelWaterMaterial?.dispose();
		this.voxelGlowMaterial?.dispose();
		this.emissiveLightManager?.dispose();
		this.renderer?.dispose();
		this.renderer?.domElement.remove();
	}

	saveWorld(): boolean {
		return this.flushWorldSave();
	}

	resetWorld(): boolean {
		const reset = this.loadDefaultWorld();

		if (reset) {
			this.flushWorldSave();
		}

		return reset;
	}

	async exportWorldToDisk(): Promise<boolean> {
		if (!ENABLE_DEV_WORLD_PERSISTENCE) {
			return false;
		}

		return exportSerializedWorldToDisk(this.world);
	}

	async importWorldFromDisk(): Promise<boolean> {
		if (!ENABLE_DEV_WORLD_PERSISTENCE) {
			return false;
		}

		const snapshot = await importSerializedWorldFromDisk();

		if (!snapshot) {
			return false;
		}

		const loaded = this.applySerializedWorld(snapshot);

		if (loaded) {
			this.flushWorldSave();
		}

		return loaded;
	}

	getSelectedMaterialId(): number {
		return this.editor.getSelectedMaterialId();
	}

	selectMaterial(materialId: number): boolean {
		return this.editor.setSelectedMaterial(materialId);
	}

	createMaterial(input: {
		name: string;
		color: [number, number, number];
		opacity: number;
		isWater: boolean;
		emitsLight: boolean;
		lightTint: [number, number, number];
	}): boolean {
		const material = createVoxelMaterial(input);

		if (!material) {
			return false;
		}

		this.editor.setSelectedMaterial(material.id);
		this.flushWorldSave();
		return true;
	}

	updateMaterialLighting(
		materialId: number,
		input: {
			emitsLight: boolean;
			lightTint: [number, number, number];
		}
	): boolean {
		const material = updateVoxelMaterialLighting(materialId, input);

		if (!material) {
			return false;
		}

		this.queueMaterialVisualRefresh(material.id);
		this.emissiveLightManager.invalidateCandidates();
		this.flushWorldSave();
		return true;
	}

	updateMaterialWater(materialId: number, input: { isWater: boolean }): boolean {
		const material = updateVoxelMaterialWater(materialId, input);

		if (!material) {
			return false;
		}

		this.queueMaterialVisualRefresh(material.id);
		this.flushWorldSave();
		return true;
	}

	deleteMaterial(materialId: number): boolean {
		const result = deleteVoxelMaterial(
			materialId,
			this.world.hasMaterialReference(materialId) || hasPropMaterialReference(materialId)
		);

		if (!result.deleted) {
			return false;
		}

		this.editor.ensureSelectedMaterialValid();
		this.flushWorldSave();
		return true;
	}

	assignMaterialToHotbarSlot(slotIndex: number, materialId: number | null): boolean {
		const changed = assignMaterialToHotbar(slotIndex, materialId);

		if (!changed) {
			return false;
		}

		this.editor.ensureSelectedMaterialValid();
		this.flushWorldSave();
		return true;
	}

	getSelectedPropBlockCount(): number {
		return this.editor.getSelectedBlockCount();
	}

	createProp(input: { name: string; interactable: boolean }): boolean {
		const prop = this.editor.createPropFromSelection(input);

		if (!prop) {
			return false;
		}

		this.flushWorldSave();
		return true;
	}

	activateNaturePreset(preset: NaturePreset): boolean {
		this.ensureNaturePalette();
		closeMaterialManager();
		closePropManager();
		closeNaturePanel();
		switch (preset) {
			case 'grass':
				this.editor.startNatureTool('nature-grass');
				syncNatureTool('grass-paint');
				break;
			case 'flowers':
				this.editor.startNatureTool('nature-flower');
				syncNatureTool('flower-paint');
				break;
			default:
				this.editor.startNatureTool('nature-tree');
				syncNatureTool('tree-place');
				break;
		}
		this.updateViewportState();
		return true;
	}

	cancelNatureTool(): void {
		this.editor.cancelNatureTool();
		clearNatureTool();
		this.updateViewportState();
	}

	updateNatureGrassSettings(input: Partial<NatureGrassSettings>): void {
		updateNatureGrassUiSettings(input);
	}

	updateNatureFlowerSettings(input: Partial<NatureFlowerSettings>): void {
		updateNatureFlowerUiSettings(input);
	}

	updateNatureTreeSettings(input: Partial<NatureTreeSettings>): void {
		updateNatureTreeUiSettings(input);
	}

	startPropPlacement(propId: number): boolean {
		this.cancelNatureTool();
		const started = this.editor.startPropPlacement(propId);

		if (started) {
			closeMaterialManager();
			closePropManager();
			closeNaturePanel();
			this.updateViewportState();
		}

		return started;
	}

	deleteProp(propId: number): boolean {
		const affectedChunkKeys = new Set<ChunkKey>();

		if (!deletePropDefinition(propId)) {
			return false;
		}

		for (const propInstance of this.world.getPropInstances()) {
			if (propInstance.propId !== propId) {
				continue;
			}

			for (const blockId of this.world.getPropInstanceBlockIds(propInstance.id)) {
				const block = this.world.blocks.get(blockId);

				if (block) {
					this.world.collectAffectedChunkKeysForBlock(block.origin, block.size, affectedChunkKeys);
				}
			}
		}

		this.world.removePropInstancesByPropId(propId);

		this.editor.handleDeletedProp(propId);
		this.queueChunkSync(affectedChunkKeys);
		this.pruneUnusedArchivedMaterials();
		this.flushWorldSave();
		return true;
	}

	private updateSize(): void {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		const pixelRatio = Math.min(window.devicePixelRatio, 1.25);

		this.renderer.setPixelRatio(pixelRatio);
		this.renderer.setSize(width, height, false);
		this.composer.setPixelRatio(pixelRatio);
		this.composer.setSize(width, height);
	}

	private invalidateShadows(): void {
		this.renderer.shadowMap.needsUpdate = true;
	}

	private updateViewportState(): void {
		const crosshair = this.container.parentElement?.querySelector('.crosshair');
		const materialManagerOpen = getMaterialManagerUiState().open;
		const naturePanelOpen = getNatureUiState().open;
		const propUiState = getPropUiState();
		const hideReticle =
			this.editor.state.enabled ||
			materialManagerOpen ||
			naturePanelOpen ||
			propUiState.managerOpen ||
			propUiState.placementActive;
		const suppressPointerLock =
			materialManagerOpen ||
			naturePanelOpen ||
			propUiState.managerOpen ||
			propUiState.placementActive;
		const enablePlacementFreeLook =
			propUiState.placementActive &&
			!materialManagerOpen &&
			!naturePanelOpen &&
			!propUiState.managerOpen;

		this.input.setPointerLockSuppressed(suppressPointerLock);
		this.input.setFreeLookEnabled(enablePlacementFreeLook && !this.editor.isTransformDragging());
		this.container.style.cursor = '';
		this.renderer.domElement.style.cursor = '';
		crosshair?.classList.toggle('crosshair-hidden', hideReticle);
	}

	private loadInitialWorld(): void {
		if (ENABLE_DEV_WORLD_PERSISTENCE && this.restoreWorldFromStorage()) {
			return;
		}

		this.loadDefaultWorld();
	}

	private loadDefaultWorld(): boolean {
		clearSerializedWorldFromStorage();
		resetVoxelPaletteToDefaults();
		resetPropLibrary();
		const seedWorld = new VoxelWorld();
		buildDenseTestSlice(seedWorld);
		return this.applyWorldState(seedWorld.getBlocks(), seedWorld.getPropInstances());
	}

	private restoreWorldFromStorage(): boolean {
		const snapshot = loadSerializedWorldFromStorage();

		if (!snapshot) {
			return false;
		}

		const restored = this.applySerializedWorld(snapshot);

		if (!restored) {
			clearSerializedWorldFromStorage();
		}

		return restored;
	}

	private applySerializedWorld(
		snapshot: SerializedVoxelWorld,
		options: {
			preserveRenderedChunks?: boolean;
			deferChunkSync?: boolean;
		} = {}
	): boolean {
		const previousPaletteState = this.capturePaletteState();
		const previousPropLibraryState = this.capturePropLibraryState();

		if (
			!restoreSerializedVoxelPaletteState(this.extractPaletteState(snapshot)) ||
			!restoreSerializedPropLibraryState(this.extractPropLibraryState(snapshot))
		) {
			return false;
		}

		if (!this.applyWorldState(snapshot.blocks, snapshot.propInstances, options)) {
			restoreSerializedVoxelPaletteState(previousPaletteState);
			restoreSerializedPropLibraryState(previousPropLibraryState);
			return false;
		}

		return true;
	}

	private applyWorldState(
		blocks: ReturnType<VoxelWorld['getBlocks']>,
		propInstances: ReturnType<VoxelWorld['getPropInstances']>,
		options: {
			preserveRenderedChunks?: boolean;
			deferChunkSync?: boolean;
		} = {}
	): boolean {
		this.editor.cancelPlacement();

		if (!this.world.replaceState(blocks, propInstances)) {
			return false;
		}

		this.ensureNaturePalette();
		this.emissiveLightManager.invalidateCandidates();
		this.editor.ensureSelectedMaterialValid();
		this.editor.resetTransientState();
		if (options.preserveRenderedChunks) {
			this.pruneStaleRenderedChunks();
		} else {
			this.clearRenderedWorld();
		}

		this.queueFullChunkSync(options.deferChunkSync ?? false);

		if (!(options.deferChunkSync ?? false)) {
			this.syncDirtyChunks();
			this.invalidateShadows();
		}
		return true;
	}

	private applyUndoSnapshot(snapshot: {
		blocks: ReturnType<VoxelWorld['getBlocks']>;
		propInstances: ReturnType<VoxelWorld['getPropInstances']>;
		palette: SerializedVoxelPaletteState;
		props: SerializedPropLibraryState;
	}): boolean {
		const applied = this.applySerializedWorld(
			{
				version: 6,
				savedAt: new Date().toISOString(),
				blocks: snapshot.blocks,
				materials: snapshot.palette.materials,
				hotbar: snapshot.palette.hotbar,
				props: snapshot.props.props,
				propInstances: snapshot.propInstances
			},
			{
				preserveRenderedChunks: true,
				deferChunkSync: true
			}
		);

		if (applied) {
			this.promoteBackgroundChunkSync(UNDO_IMMEDIATE_CHUNK_SYNC_LIMIT);
			this.syncPendingChunkMeshes();
			this.flushWorldSave();
		}

		return applied;
	}

	private pruneStaleRenderedChunks(): void {
		for (const [chunkKey, chunkMesh] of this.chunkMeshes) {
			if (this.world.getChunkByKey(chunkKey)) {
				continue;
			}

			this.voxelRoot.remove(chunkMesh.root);
			chunkMesh.dispose();
			this.chunkMeshes.delete(chunkKey);
		}

		for (const [chunkKey, helper] of this.chunkBounds) {
			if (this.world.getChunkByKey(chunkKey)) {
				continue;
			}

			this.voxelRoot.remove(helper);
			disposeDebugObject(helper);
			this.chunkBounds.delete(chunkKey);
		}

		this.pendingChunkSyncKeys.clear();
		this.resetBackgroundChunkSyncState();
		this.lastDirtyChunkCount = 0;
	}

	private syncChunkMeshes(
		dirtyChunks: ReadonlyArray<ReturnType<VoxelWorld['getDirtyChunks']>[number]>,
		queue: Set<ChunkKey>
	): number {
		for (const chunk of dirtyChunks) {
			const key = this.world.getChunkKey(chunk.coord.x, chunk.coord.y, chunk.coord.z);
			const buffers = buildChunkMesh(this.world, chunk);
			let chunkMesh = this.chunkMeshes.get(key);

			if (!chunkMesh) {
				chunkMesh = new ChunkMesh(
					chunk,
					this.voxelOpaqueMaterial,
					this.voxelTransparentMaterial,
					this.voxelWaterMaterial,
					this.voxelGlowMaterial
				);
				this.chunkMeshes.set(key, chunkMesh);
				this.voxelRoot.add(chunkMesh.root);

				if (SHOW_CHUNK_BOUNDS) {
					const helper = createChunkBoundsHelper(chunk.coord);
					this.chunkBounds.set(key, helper);
					this.voxelRoot.add(helper);
				}
			}

			chunkMesh.update(buffers);
			this.world.clearDirty(chunk);
			queue.delete(key);
		}

		return dirtyChunks.length;
	}

	private syncPendingChunkMeshes(): number {
		this.pruneCleanChunkSyncKeys(this.pendingChunkSyncKeys);
		const dirtyChunks = this.world.getDirtyChunks(this.pendingChunkSyncKeys);
		const processedCount = this.syncChunkMeshes(dirtyChunks, this.pendingChunkSyncKeys);

		if (processedCount > 0) {
			this.invalidateShadows();
		}

		return processedCount;
	}

	private syncBackgroundChunkMeshes(): number {
		if (this.backgroundChunkSyncKeySet.size === 0 || this.backgroundChunkSyncQueue.length === 0) {
			this.resetBackgroundChunkSyncState();
			return 0;
		}

		const startTime = performance.now();
		const dirtyChunks: ReturnType<VoxelWorld['getDirtyChunks']> = [];

		while (this.backgroundChunkSyncIndex < this.backgroundChunkSyncQueue.length) {
			if (
				dirtyChunks.length >= BULK_CHUNK_SYNC_PER_FRAME ||
				performance.now() - startTime >= BULK_CHUNK_SYNC_FRAME_BUDGET_MS
			) {
				break;
			}

			const chunkKey = this.backgroundChunkSyncQueue[this.backgroundChunkSyncIndex++];

			if (!this.backgroundChunkSyncKeySet.has(chunkKey)) {
				continue;
			}

			const chunk = this.world.getChunkByKey(chunkKey);

			if (!chunk?.dirty) {
				this.backgroundChunkSyncKeySet.delete(chunkKey);
			} else {
				dirtyChunks.push(chunk);
			}
		}

		if (this.backgroundChunkSyncIndex >= this.backgroundChunkSyncQueue.length) {
			this.backgroundChunkSyncQueue = [];
			this.backgroundChunkSyncIndex = 0;
		}

		const processedCount = this.syncChunkMeshes(dirtyChunks, this.backgroundChunkSyncKeySet);

		if (this.backgroundChunkSyncKeySet.size === 0 && this.backgroundChunkSyncQueue.length === 0) {
			this.nextBackgroundShadowRefreshAt = 0;
		}

		return processedCount;
	}

	private pruneCleanChunkSyncKeys(queue: Set<ChunkKey>): void {
		for (const chunkKey of [...queue]) {
			if (this.world.getChunkByKey(chunkKey)?.dirty) {
				continue;
			}

			queue.delete(chunkKey);
		}
	}

	private queueFullChunkSync(deferChunkSync: boolean): void {
		this.pendingChunkSyncKeys.clear();
		this.resetBackgroundChunkSyncState();

		if (!deferChunkSync) {
			for (const chunkKey of this.world.chunks.keys()) {
				this.pendingChunkSyncKeys.add(chunkKey);
			}

			return;
		}

		const playerChunkCoord = this.world.getChunkCoordFromWorld(
			Math.floor(this.player.position.x),
			Math.floor(this.player.position.y),
			Math.floor(this.player.position.z)
		);
		const chunkKeys = [...this.world.chunks.values()]
			.sort((left, right) => {
				const leftDistance =
					(left.coord.x - playerChunkCoord.x) ** 2 +
					(left.coord.y - playerChunkCoord.y) ** 2 +
					(left.coord.z - playerChunkCoord.z) ** 2;
				const rightDistance =
					(right.coord.x - playerChunkCoord.x) ** 2 +
					(right.coord.y - playerChunkCoord.y) ** 2 +
					(right.coord.z - playerChunkCoord.z) ** 2;

				return leftDistance - rightDistance;
			})
			.map((chunk) => this.world.getChunkKey(chunk.coord.x, chunk.coord.y, chunk.coord.z));

		this.backgroundChunkSyncQueue = chunkKeys;

		for (const chunkKey of chunkKeys) {
			this.backgroundChunkSyncKeySet.add(chunkKey);
		}

		this.nextBackgroundShadowRefreshAt = performance.now() + BACKGROUND_SHADOW_REFRESH_INTERVAL_MS;
	}

	private promoteBackgroundChunkSync(chunkLimit: number): void {
		if (chunkLimit <= 0 || this.backgroundChunkSyncKeySet.size === 0) {
			return;
		}

		let promotedCount = this.promoteBackgroundChunkSyncWhere(chunkLimit, (chunkKey) =>
			this.chunkMeshes.has(chunkKey)
		);

		if (promotedCount < chunkLimit) {
			promotedCount += this.promoteBackgroundChunkSyncWhere(chunkLimit - promotedCount, () => true);
		}

		if (promotedCount > 0) {
			this.lastDirtyChunkCount =
				this.pendingChunkSyncKeys.size + this.backgroundChunkSyncKeySet.size;
		}
	}

	private promoteBackgroundChunkSyncWhere(
		chunkLimit: number,
		predicate: (chunkKey: ChunkKey) => boolean
	): number {
		let promotedCount = 0;

		for (const chunkKey of this.backgroundChunkSyncQueue) {
			if (promotedCount >= chunkLimit) {
				break;
			}

			if (!this.backgroundChunkSyncKeySet.has(chunkKey) || !predicate(chunkKey)) {
				continue;
			}

			this.pendingChunkSyncKeys.add(chunkKey);
			this.backgroundChunkSyncKeySet.delete(chunkKey);
			promotedCount += 1;
		}

		return promotedCount;
	}

	private clearRenderedWorld(): void {
		for (const chunkMesh of this.chunkMeshes.values()) {
			this.voxelRoot.remove(chunkMesh.root);
			chunkMesh.dispose();
		}

		this.chunkMeshes.clear();

		for (const helper of this.chunkBounds.values()) {
			this.voxelRoot.remove(helper);
			disposeDebugObject(helper);
		}

		this.chunkBounds.clear();
		this.pendingChunkSyncKeys.clear();
		this.resetBackgroundChunkSyncState();
		this.lastDirtyChunkCount = 0;
	}

	private resetBackgroundChunkSyncState(): void {
		this.backgroundChunkSyncKeySet.clear();
		this.backgroundChunkSyncQueue = [];
		this.backgroundChunkSyncIndex = 0;
		this.nextBackgroundShadowRefreshAt = 0;
	}

	private handleOverlayHotkeys(): void {
		const materialManagerOpen = getMaterialManagerUiState().open;
		const naturePanelOpen = getNatureUiState().open;
		const propUiState = getPropUiState();
		const propManagerOpen = propUiState.managerOpen;
		const propPlacementActive = propUiState.placementActive;
		const ignoreToggleHotkey = isTextInputElement(document.activeElement);

		if (!ignoreToggleHotkey && this.input.consumeKeyPress('KeyL')) {
			this.toggleTimeOfDay();
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyM')) {
			closeNaturePanel();
			closePropManager();
			openMaterialManager();
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyN')) {
			closeMaterialManager();
			closePropManager();
			toggleNaturePanel();
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyG')) {
			this.activateNaturePreset('grass');
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyF')) {
			this.activateNaturePreset('flowers');
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyT')) {
			this.activateNaturePreset('trees');
		}

		if (!ignoreToggleHotkey && !propPlacementActive && this.input.consumeKeyPress('KeyP')) {
			closeMaterialManager();
			closeNaturePanel();
			openPropManager();
		}

		if (!propPlacementActive && this.input.consumeKeyPress('Escape')) {
			if (materialManagerOpen) {
				closeMaterialManager();
			}

			if (naturePanelOpen) {
				closeNaturePanel();
			}

			if (propManagerOpen) {
				closePropManager();
			}
		}

		const nextMaterialManagerOpen = getMaterialManagerUiState().open;
		const nextNaturePanelOpen = getNatureUiState().open;
		const nextPropUiState = getPropUiState();
		const nextPropManagerOpen = nextPropUiState.managerOpen;
		const nextPropPlacementActive = nextPropUiState.placementActive;
		const anyOverlayJustOpened =
			(nextMaterialManagerOpen && !this.materialManagerWasOpen) ||
			(nextNaturePanelOpen && !this.naturePanelWasOpen) ||
			(nextPropManagerOpen && !this.propManagerWasOpen) ||
			(nextPropPlacementActive && !this.propPlacementWasActive);
		const anyOverlayJustClosed =
			(!nextMaterialManagerOpen && this.materialManagerWasOpen) ||
			(!nextNaturePanelOpen && this.naturePanelWasOpen) ||
			(!nextPropManagerOpen && this.propManagerWasOpen) ||
			(!nextPropPlacementActive && this.propPlacementWasActive);

		if (anyOverlayJustOpened) {
			this.input.exitPointerLock();
			this.editor.resetTransientState();
		}

		if (anyOverlayJustClosed) {
			this.editor.resetTransientState();
		}

		this.materialManagerWasOpen = nextMaterialManagerOpen;
		this.naturePanelWasOpen = nextNaturePanelOpen;
		this.propManagerWasOpen = nextPropManagerOpen;
		this.propPlacementWasActive = nextPropPlacementActive;
	}

	private pruneUnusedArchivedMaterials(): void {
		const referencedMaterialIds = this.world.getReferencedMaterialIds();

		for (const materialId of getReferencedPropMaterialIds()) {
			referencedMaterialIds.add(materialId);
		}

		if (!pruneUnusedArchivedVoxelMaterials(referencedMaterialIds)) {
			return;
		}

		this.editor.ensureSelectedMaterialValid();
	}

	private scheduleWorldSave(hasWorldChanges: boolean): void {
		if (!ENABLE_DEV_WORLD_PERSISTENCE || !hasWorldChanges) {
			return;
		}

		this.clearScheduledWorldSave();
		this.autoSaveHandle = window.setTimeout(() => {
			this.autoSaveHandle = null;
			saveSerializedWorldToStorage(this.world);
		}, WORLD_SAVE_DEBOUNCE_MS);
	}

	private flushWorldSave(): boolean {
		if (!ENABLE_DEV_WORLD_PERSISTENCE) {
			return false;
		}

		this.clearScheduledWorldSave();
		return saveSerializedWorldToStorage(this.world) !== null;
	}

	private clearScheduledWorldSave(): void {
		if (this.autoSaveHandle === null) {
			return;
		}

		window.clearTimeout(this.autoSaveHandle);
		this.autoSaveHandle = null;
	}

	private handleBeforeUnload = (): void => {
		this.flushWorldSave();
	};

	private queueChunkSync(chunkKeys: Iterable<ChunkKey>): void {
		for (const chunkKey of chunkKeys) {
			this.pendingChunkSyncKeys.add(chunkKey);
			this.backgroundChunkSyncKeySet.delete(chunkKey);
		}
	}

	private queueMaterialVisualRefresh(materialId: number): void {
		const affectedChunkKeys = new Set<ChunkKey>();

		for (const block of this.world.blocks.values()) {
			if (block.materialId !== materialId) {
				continue;
			}

			this.world.collectAffectedChunkKeysForBlock(block.origin, block.size, affectedChunkKeys);
		}

		for (const chunkKey of affectedChunkKeys) {
			const chunk = this.world.getChunkByKey(chunkKey);

			if (chunk) {
				chunk.dirty = true;
			}
		}

		this.queueChunkSync(affectedChunkKeys);
	}

	private toggleTimeOfDay(): void {
		const nextTimeOfDay = this.sceneBundle.timeOfDay === 'day' ? 'night' : 'day';
		applySceneTimeOfDay(this.sceneBundle, nextTimeOfDay);
		this.invalidateShadows();
	}

	private syncRenderMaterialUniforms(): void {
		const sunLight = this.sceneBundle.sunLight;
		const fog = this.scene.fog;
		const fogColor = fog instanceof THREE.Fog ? fog.color : new THREE.Color('#c2cfd1');
		const fogNear = fog instanceof THREE.Fog ? fog.near : 24;
		const fogFar = fog instanceof THREE.Fog ? fog.far : 84;
		const heightFogStrength = this.sceneBundle.timeOfDay === 'night' ? 0.14 : 0.2;
		const heightFogFalloff = this.sceneBundle.timeOfDay === 'night' ? 0.24 : 0.18;

		this.waterSunPosition.copy(sunLight.position);
		this.waterSunTargetPosition.copy(sunLight.target.position);
		this.waterSunDirection.copy(this.waterSunPosition).sub(this.waterSunTargetPosition).normalize();

		syncVoxelSurfaceMaterial(this.voxelOpaqueMaterial, {
			sunDirection: this.waterSunDirection,
			sunColor: sunLight.color,
			sunIntensity: sunLight.intensity,
			skyColor: this.sceneBundle.hemisphereLight.color,
			groundColor: this.sceneBundle.hemisphereLight.groundColor,
			fogColor,
			fogNear,
			fogFar,
			heightFogStrength,
			heightFogFalloff
		});
		syncVoxelSurfaceMaterial(this.voxelTransparentMaterial, {
			sunDirection: this.waterSunDirection,
			sunColor: sunLight.color,
			sunIntensity: sunLight.intensity,
			skyColor: this.sceneBundle.hemisphereLight.color,
			groundColor: this.sceneBundle.hemisphereLight.groundColor,
			fogColor,
			fogNear,
			fogFar,
			heightFogStrength,
			heightFogFalloff
		});
		this.voxelWaterMaterial.uniforms.uTime.value = performance.now() * 0.001;
		this.voxelWaterMaterial.uniforms.uVoxelScale.value = VOXEL_WORLD_SIZE;
		this.voxelWaterMaterial.uniforms.uSunDirection.value.copy(this.waterSunDirection);
		this.voxelWaterMaterial.uniforms.uSunColor.value.copy(sunLight.color);
		this.voxelWaterMaterial.uniforms.uSunIntensity.value = sunLight.intensity;
		this.voxelWaterMaterial.uniforms.uSkyColor.value.copy(this.sceneBundle.hemisphereLight.color);
		this.voxelWaterMaterial.uniforms.uGroundColor.value.copy(
			this.sceneBundle.hemisphereLight.groundColor
		);
		this.voxelWaterMaterial.uniforms.fogColor.value.copy(fogColor);
		this.voxelWaterMaterial.uniforms.fogNear.value = fogNear;
		this.voxelWaterMaterial.uniforms.fogFar.value = fogFar;
		this.voxelWaterMaterial.uniforms.uFogHeightStrength.value = heightFogStrength;
		this.voxelWaterMaterial.uniforms.uFogHeightFalloff.value = heightFogFalloff;
	}

	private capturePaletteState(): SerializedVoxelPaletteState {
		return restoreSnapshotClone(createSerializedVoxelPaletteState());
	}

	private capturePropLibraryState(): SerializedPropLibraryState {
		return clonePropLibraryState(createSerializedPropLibraryState());
	}

	private extractPaletteState(snapshot: SerializedVoxelWorld | null): SerializedVoxelPaletteState {
		return {
			materials: (snapshot?.materials ?? []).map((material) => ({
				id: material.id,
				name: material.name,
				color: [...material.color] as [number, number, number],
				opacity: material.opacity,
				isWater: material.isWater ?? false,
				emitsLight: material.emitsLight ?? false,
				lightTint: [...(material.lightTint ?? material.color)] as [number, number, number],
				natureRole: material.natureRole,
				archived: material.archived
			})),
			hotbar: [...(snapshot?.hotbar ?? [])]
		};
	}

	private ensureNaturePalette(): void {
		ensureNatureMaterials();
	}

	private syncNatureToolState(): void {
		syncNatureTool(this.editor.getNatureToolType());
	}

	private extractPropLibraryState(
		snapshot: SerializedVoxelWorld | null
	): SerializedPropLibraryState {
		return {
			props: (snapshot?.props ?? []).map((prop) => ({
				id: prop.id,
				name: prop.name,
				interactable: prop.interactable,
				blocks: prop.blocks.map((block) => ({
					materialId: block.materialId,
					origin: { ...block.origin },
					size: block.size
				})),
				bounds: {
					min: { ...prop.bounds.min },
					max: { ...prop.bounds.max }
				}
			}))
		};
	}
}

function restoreSnapshotClone(state: SerializedVoxelPaletteState): SerializedVoxelPaletteState {
	return {
		materials: state.materials.map((material) => ({
			id: material.id,
			name: material.name,
			color: [...material.color] as [number, number, number],
			opacity: material.opacity,
			isWater: material.isWater ?? false,
			emitsLight: material.emitsLight ?? false,
			lightTint: [...(material.lightTint ?? material.color)] as [number, number, number],
			natureRole: material.natureRole,
			archived: material.archived
		})),
		hotbar: [...state.hotbar]
	};
}

function clonePropLibraryState(state: SerializedPropLibraryState): SerializedPropLibraryState {
	return {
		props: state.props.map((prop) => ({
			id: prop.id,
			name: prop.name,
			interactable: prop.interactable,
			blocks: prop.blocks.map((block) => ({
				materialId: block.materialId,
				origin: { ...block.origin },
				size: block.size
			})),
			bounds: {
				min: { ...prop.bounds.min },
				max: { ...prop.bounds.max }
			}
		}))
	};
}

function isTextInputElement(element: Element | null): boolean {
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement
	);
}
