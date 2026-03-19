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
	mode: string;
	planeConstraint: string;
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
		mode: 'add',
		planeConstraint: 'Free 3D',
		hoveredChunk: null
	};

	constructor(container: HTMLElement) {
		this.element = document.createElement('div');
		this.element.style.position = 'absolute';
		this.element.style.left = '16px';
		this.element.style.top = '16px';
		this.element.style.zIndex = '2';
		this.element.style.padding = '10px 12px';
		this.element.style.borderRadius = '12px';
		this.element.style.background = 'rgba(18, 24, 27, 0.78)';
		this.element.style.color = '#f6f1e8';
		this.element.style.font = "12px/1.45 'Consolas', 'SFMono-Regular', monospace";
		this.element.style.whiteSpace = 'pre';
		this.element.style.pointerEvents = 'none';
		this.element.style.backdropFilter = 'blur(6px)';
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
			mode,
			planeConstraint,
			hoveredChunk
		} = this.snapshot;
		const targetText = targetedVoxel
			? `${targetedVoxel.voxel.x}, ${targetedVoxel.voxel.y}, ${targetedVoxel.voxel.z}  n(${targetedVoxel.normal.x}, ${targetedVoxel.normal.y}, ${targetedVoxel.normal.z})`
			: 'none';
		const hoveredChunkText = hoveredChunk
			? `${hoveredChunk.x}, ${hoveredChunk.y}, ${hoveredChunk.z}`
			: 'none';

		this.element.textContent = `FPS ${this.fps.toFixed(1)}
Pos ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}
Ground ${onGround ? 'yes' : 'no'}
Lock ${pointerLocked ? 'captured' : 'click viewport'}
Chunks ${chunkCount}
Dirty ${dirtyChunkCount}
Editor ${editorEnabled ? 'enabled' : 'off'}
Tool ${activeTool}
Mode ${mode}
Mat ${selectedMaterial}
Plane ${planeConstraint}
Target ${targetText}
Chunk@Aim ${hoveredChunkText}
Controls WASD move | Shift sprint | Space jump | Tab editor
Hold Shift + drag to grow region with brush tools
Build Q add | E remove | R paint | Shift+R box paint
Box B fill | H hollow | C carve | [ ] or wheel material | 1 2 3 4 plane`;
	}
}
