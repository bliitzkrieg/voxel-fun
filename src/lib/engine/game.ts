import * as THREE from 'three';

import { getBoxConstraintLabel, getEditorToolLabel } from '$lib/editor/editorState';
import { EditorController } from '$lib/editor/editorController';
import { createChunkBoundsHelper, disposeDebugObject } from '$lib/debug/debugDraw';
import { DebugStats } from '$lib/debug/stats';
import { InputState } from '$lib/engine/input';
import { FixedLoop } from '$lib/engine/loop';
import { createGameScene } from '$lib/engine/scene';
import { PlayerController } from '$lib/player/playerController';
import { ChunkMesh } from '$lib/voxel/chunkMesh';
import { buildDenseTestSlice } from '$lib/voxel/denseTestSlice';
import { buildChunkMesh } from '$lib/voxel/mesher';
import { getVoxelPaletteEntry } from '$lib/voxel/voxelPalette';
import type { ChunkKey } from '$lib/voxel/voxelTypes';
import { VoxelWorld } from '$lib/voxel/world';

const SHOW_CHUNK_BOUNDS = false;

export class Game {
	scene!: THREE.Scene;
	camera!: THREE.PerspectiveCamera;
	renderer!: THREE.WebGLRenderer;

	world!: VoxelWorld;
	player!: PlayerController;
	editor!: EditorController;

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

	constructor(container: HTMLElement) {
		this.container = container;
	}

	init(): void {
		const { scene } = createGameScene();
		this.scene = scene;
		this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setClearColor('#c9d0cf');
		this.renderer.domElement.style.display = 'block';
		this.renderer.domElement.style.width = '100%';
		this.renderer.domElement.style.height = '100%';

		this.container.style.position = 'relative';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.replaceChildren(this.renderer.domElement);

		this.input = new InputState(this.renderer.domElement);
		this.world = new VoxelWorld();
		this.voxelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });
		this.player = new PlayerController(this.world, this.camera, this.input);
		this.editor = new EditorController(
			this.world,
			this.camera,
			this.input,
			this.scene,
			this.player
		);

		this.stats = new DebugStats(this.container);

		this.buildInitialWorld();
		this.player.teleport(16, 1, 11);
		this.player.setLookAngles(Math.PI, -0.05);
		this.syncDirtyChunks();
		this.updateSize();

		this.resizeObserver = new ResizeObserver(() => {
			this.updateSize();
			this.render();
		});
		this.resizeObserver.observe(this.container);

		this.loop = new FixedLoop(
			(dt) => this.update(dt),
			() => this.render()
		);
		this.loop.start();
	}

	buildInitialWorld(): void {
		const result = buildDenseTestSlice(this.world);
		this.queueChunkSync(result.affectedChunkKeys);
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
				this.scene.add(chunkMesh.mesh);

				if (SHOW_CHUNK_BOUNDS) {
					const helper = createChunkBoundsHelper(chunk.coord);
					this.chunkBounds.set(key, helper);
					this.scene.add(helper);
				}
			}

			chunkMesh.update(buffers);
			this.world.clearDirty(chunk);
		}

		this.pendingChunkSyncKeys.clear();
	}

	update(dt: number): void {
		this.player.update(dt);
		this.queueChunkSync(this.editor.update());
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
			mode: this.editor.state.mode,
			planeConstraint: getBoxConstraintLabel(this.editor.state.boxConstraint),
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
		this.editor?.dispose();
		this.input?.dispose();
		this.stats?.dispose();

		for (const chunkMesh of this.chunkMeshes.values()) {
			this.scene.remove(chunkMesh.mesh);
			chunkMesh.dispose();
		}

		this.chunkMeshes.clear();

		for (const helper of this.chunkBounds.values()) {
			this.scene.remove(helper);
			disposeDebugObject(helper);
		}

		this.chunkBounds.clear();

		this.voxelMaterial?.dispose();
		this.renderer?.dispose();
		this.renderer?.domElement.remove();
	}

	private updateSize(): void {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height, false);
	}

	private queueChunkSync(chunkKeys: Iterable<ChunkKey>): void {
		for (const chunkKey of chunkKeys) {
			this.pendingChunkSyncKeys.add(chunkKey);
		}
	}
}
