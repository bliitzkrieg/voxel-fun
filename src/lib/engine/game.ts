import * as THREE from 'three';

import { getEditorToolLabel } from '$lib/editor/editorState';
import { EditorController } from '$lib/editor/editorController';
import { createChunkBoundsHelper, disposeDebugObject } from '$lib/debug/debugDraw';
import { DebugStats } from '$lib/debug/stats';
import { InputState } from '$lib/engine/input';
import { FixedLoop } from '$lib/engine/loop';
import { createGameScene } from '$lib/engine/scene';
import { PlayerController } from '$lib/player/playerController';
import { ChunkMesh } from '$lib/voxel/chunkMesh';
import { DEFAULT_VOXEL_SIZE } from '$lib/voxel/constants';
import { buildDenseTestSlice } from '$lib/voxel/denseTestSlice';
import { buildChunkMesh } from '$lib/voxel/mesher';
import { VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import {
	clearSerializedWorldFromStorage,
	exportSerializedWorldToDisk,
	importSerializedWorldFromDisk,
	loadSerializedWorldFromStorage,
	saveSerializedWorldToStorage
} from '$lib/voxel/worldPersistence';
import { getVoxelPaletteEntry } from '$lib/voxel/voxelPalette';
import type { ChunkKey } from '$lib/voxel/voxelTypes';
import { VoxelWorld } from '$lib/voxel/world';

const SHOW_CHUNK_BOUNDS = false;
const ENABLE_DEV_WORLD_PERSISTENCE = import.meta.env.DEV;
const WORLD_SAVE_DEBOUNCE_MS = 300;

export class Game {
	scene!: THREE.Scene;
	camera!: THREE.PerspectiveCamera;
	renderer!: THREE.WebGLRenderer;

	world!: VoxelWorld;
	player!: PlayerController;
	editor!: EditorController;
	voxelRoot!: THREE.Group;

	chunkMeshes: Map<ChunkKey, ChunkMesh> = new Map();
	voxelMaterial!: THREE.MeshStandardMaterial;

	private readonly container: HTMLElement;
	private input!: InputState;
	private loop!: FixedLoop;
	private resizeObserver!: ResizeObserver;
	private stats!: DebugStats;
	private readonly chunkBounds = new Map<ChunkKey, THREE.Object3D>();
	private readonly pendingChunkSyncKeys = new Set<ChunkKey>();
	private lastDirtyChunkCount = 0;
	private autoSaveHandle: number | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	init(): void {
		const { scene } = createGameScene();
		this.scene = scene;
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
		this.renderer.toneMappingExposure = 1.1;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setClearColor('#bfd2d9');
		this.renderer.domElement.style.display = 'block';
		this.renderer.domElement.style.width = '100%';
		this.renderer.domElement.style.height = '100%';

		this.container.style.position = 'relative';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.replaceChildren(this.renderer.domElement);

		this.input = new InputState(this.renderer.domElement);
		this.world = new VoxelWorld();
		this.voxelMaterial = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.92,
			metalness: 0.06
		});
		this.player = new PlayerController(this.world, this.camera, this.input);
		this.editor = new EditorController(
			this.world,
			this.camera,
			this.input,
			this.voxelRoot,
			this.player,
			(blocks) => this.applyUndoSnapshot(blocks)
		);

		this.stats = new DebugStats(this.container);

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
		const dirtyChunks =
			this.pendingChunkSyncKeys.size > 0
				? this.world.getDirtyChunks(this.pendingChunkSyncKeys)
				: this.world.getDirtyChunks();

		for (const chunk of dirtyChunks) {
			const key = this.world.getChunkKey(chunk.coord.x, chunk.coord.y, chunk.coord.z);
			const buffers = buildChunkMesh(this.world, chunk);
			let chunkMesh = this.chunkMeshes.get(key);

			if (!chunkMesh) {
				chunkMesh = new ChunkMesh(chunk, this.voxelMaterial);
				this.chunkMeshes.set(key, chunkMesh);
				this.voxelRoot.add(chunkMesh.mesh);

				if (SHOW_CHUNK_BOUNDS) {
					const helper = createChunkBoundsHelper(chunk.coord);
					this.chunkBounds.set(key, helper);
					this.voxelRoot.add(helper);
				}
			}

			chunkMesh.update(buffers);
			this.world.clearDirty(chunk);
		}

		this.pendingChunkSyncKeys.clear();
	}

	update(dt: number): void {
		this.player.update(dt);
		const changedChunkKeys = this.editor.update();
		this.queueChunkSync(changedChunkKeys);
		this.scheduleWorldSave(changedChunkKeys.size > 0);
		this.updateViewportState();
		this.lastDirtyChunkCount = Math.max(
			this.pendingChunkSyncKeys.size,
			this.world.getDirtyChunks().length
		);
		this.syncDirtyChunks();

		const hoveredChunk = this.editor.getHoveredChunkCoord();
		const selectedMaterial =
			getVoxelPaletteEntry(this.editor.state.selectedVoxelId)?.name ?? 'Unknown';

		this.stats.update({
			position: this.player.position,
			onGround: this.player.onGround,
			pointerLocked: this.input.isPointerLocked(),
			targetedVoxel: this.editor.state.hoverHit,
			chunkCount: this.world.chunks.size,
			dirtyChunkCount: this.lastDirtyChunkCount,
			editorEnabled: this.editor.state.enabled,
			activeTool: getEditorToolLabel(this.editor.state.activeTool),
			selectedMaterial,
			selectedSize: this.editor.state.selectedVoxelSize,
			mode: this.editor.state.mode,
			hoveredChunk
		});
	}

	render(): void {
		this.stats.recordFrame();
		this.renderer.render(this.scene, this.camera);
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

		this.voxelMaterial?.dispose();
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

		const loaded = this.applyWorldBlocks(snapshot.blocks);

		if (loaded) {
			this.flushWorldSave();
		}

		return loaded;
	}

	private updateSize(): void {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height, false);
	}

	private updateViewportState(): void {
		const crosshair = this.container.parentElement?.querySelector('.crosshair');

		this.container.style.cursor = '';
		this.renderer.domElement.style.cursor = '';
		crosshair?.classList.toggle('crosshair-hidden', this.editor.state.enabled);
	}

	private loadInitialWorld(): void {
		if (ENABLE_DEV_WORLD_PERSISTENCE && this.restoreWorldFromStorage()) {
			return;
		}

		this.loadDefaultWorld();
	}

	private loadDefaultWorld(): boolean {
		clearSerializedWorldFromStorage();
		const seedWorld = new VoxelWorld();
		buildDenseTestSlice(seedWorld);
		return this.applyWorldBlocks(seedWorld.getBlocks());
	}

	private restoreWorldFromStorage(): boolean {
		const snapshot = loadSerializedWorldFromStorage();

		if (!snapshot) {
			return false;
		}

		const restored = this.applyWorldBlocks(snapshot.blocks);

		if (!restored) {
			clearSerializedWorldFromStorage();
		}

		return restored;
	}

	private applyWorldBlocks(blocks: ReturnType<VoxelWorld['getBlocks']>): boolean {
		if (!this.world.replaceBlocks(blocks)) {
			return false;
		}

		this.editor.resetTransientState();
		this.clearRenderedWorld();
		this.syncDirtyChunks();
		return true;
	}

	private applyUndoSnapshot(blocks: ReturnType<VoxelWorld['getBlocks']>): boolean {
		const applied = this.applyWorldBlocks(blocks);

		if (applied) {
			this.flushWorldSave();
		}

		return applied;
	}

	private clearRenderedWorld(): void {
		for (const chunkMesh of this.chunkMeshes.values()) {
			this.voxelRoot.remove(chunkMesh.mesh);
			chunkMesh.dispose();
		}

		this.chunkMeshes.clear();

		for (const helper of this.chunkBounds.values()) {
			this.voxelRoot.remove(helper);
			disposeDebugObject(helper);
		}

		this.chunkBounds.clear();
		this.pendingChunkSyncKeys.clear();
		this.lastDirtyChunkCount = 0;
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
		}
	}
}
