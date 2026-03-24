import { DEFAULT_VOXEL_SIZE } from '$lib/voxel/constants';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { ChunkCoord } from '$lib/voxel/voxelTypes';

export interface DebugSnapshot {
	position: { x: number; y: number; z: number };
	onGround: boolean;
	pointerLocked: boolean;
	targetedVoxel: VoxelHit | null;
	chunkCount: number;
	dirtyChunkCount: number;
	editorEnabled: boolean;
	activeTool: string;
	selectedMaterial: string;
	selectedSize: number;
	mode: string;
	hoveredChunk: ChunkCoord | null;
}

export class DebugStats {
	private readonly element: HTMLDivElement;
	private lastFrameTime = 0;
	private fps = 0;
	private snapshot: DebugSnapshot = {
		position: { x: 0, y: 0, z: 0 },
		onGround: false,
		pointerLocked: false,
		targetedVoxel: null,
		chunkCount: 0,
		dirtyChunkCount: 0,
		editorEnabled: false,
		activeTool: 'Brush Add',
		selectedMaterial: 'Concrete',
		selectedSize: DEFAULT_VOXEL_SIZE,
		mode: 'add',
		hoveredChunk: null
	};

	constructor(container: HTMLElement) {
		this.element = document.createElement('div');
		this.element.className = 'game-hud';
		container.appendChild(this.element);
		this.render();
	}

	update(snapshot: DebugSnapshot): void {
		this.snapshot = snapshot;
		this.render();
	}

	recordFrame(now: number = performance.now()): void {
		if (this.lastFrameTime > 0) {
			const instantFps = 1000 / Math.max(1, now - this.lastFrameTime);
			this.fps = this.fps === 0 ? instantFps : this.fps * 0.85 + instantFps * 0.15;
		}

		this.lastFrameTime = now;
		this.render();
	}

	dispose(): void {
		this.element.remove();
	}

	private render(): void {
		const {
			position,
			onGround,
			pointerLocked,
			targetedVoxel,
			chunkCount,
			dirtyChunkCount,
			editorEnabled,
			activeTool,
			selectedMaterial,
			selectedSize,
			mode,
			hoveredChunk
		} = this.snapshot;
		const hoveredChunkText = hoveredChunk
			? `${hoveredChunk.x}, ${hoveredChunk.y}, ${hoveredChunk.z}`
			: 'none';
		const editorStatus = editorEnabled ? 'Editor live' : 'Editor off';
		const groundedStatus = onGround ? 'Grounded' : 'Airborne';
		const lockStatus = pointerLocked ? 'Aim locked' : 'Viewport idle';

		this.element.innerHTML = `
			<div class="hud-panel-header">
				<div class="hud-panel-title">Field Readout</div>
				<div class="hud-panel-fps">${this.fps.toFixed(1)} FPS</div>
			</div>
			<div class="hud-chip-row">
				<div class="hud-chip"><span class="hud-chip-dot"></span>${editorStatus}</div>
				<div class="hud-chip"><span class="hud-chip-dot"></span>${groundedStatus}</div>
				<div class="hud-chip"><span class="hud-chip-dot"></span>${lockStatus}</div>
			</div>
			<div class="hud-grid">
				<div class="hud-card">
					<div class="hud-card-label">Tool</div>
					<div class="hud-card-value">${activeTool}</div>
					<div class="hud-card-subvalue">Mode ${mode}</div>
				</div>
				<div class="hud-card">
					<div class="hud-card-label">Build Loadout</div>
					<div class="hud-card-value">${selectedMaterial}</div>
					<div class="hud-card-subvalue">Size ${selectedSize}</div>
				</div>
				<div class="hud-card">
					<div class="hud-card-label">Position</div>
					<div class="hud-card-value">${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}</div>
					<div class="hud-card-subvalue">Chunk ${hoveredChunkText}</div>
				</div>
				<div class="hud-card">
					<div class="hud-card-label">World State</div>
					<div class="hud-card-value">${chunkCount} chunks</div>
					<div class="hud-card-subvalue">${dirtyChunkCount} dirty for sync</div>
				</div>
			</div>
			<div class="hud-target-block">
				<div class="hud-target-title">Current Target</div>
				<div class="hud-target-copy">${targetedVoxel ? `Block <strong>${targetedVoxel.block.size}</strong> at <strong>${targetedVoxel.block.origin.x}, ${targetedVoxel.block.origin.y}, ${targetedVoxel.block.origin.z}</strong><br />Face normal <strong>${targetedVoxel.normal.x}, ${targetedVoxel.normal.y}, ${targetedVoxel.normal.z}</strong>` : 'No block under the crosshair.'}</div>
			</div>
		`;
	}
}
