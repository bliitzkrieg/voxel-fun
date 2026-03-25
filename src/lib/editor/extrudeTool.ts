import * as THREE from 'three';

import type { EditorMode } from '$lib/editor/editorState';
import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import { DEFAULT_VOXEL_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import { extrudeFaceCommand } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelBlock, VoxelBlockId, WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const DRAG_PIXELS_PER_STEP = 24;
const MAX_EXTRUDE_DISTANCE = 14 * DEFAULT_VOXEL_SIZE;
const MIN_SCREEN_AXIS_LENGTH_SQ = 1e-6;
const FACE_TANGENTS_X: ReadonlyArray<WorldCoord> = [
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
const FACE_TANGENTS_Y: ReadonlyArray<WorldCoord> = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 0, z: 1 },
	{ x: 0, y: 0, z: -1 }
];
const FACE_TANGENTS_Z: ReadonlyArray<WorldCoord> = [
	{ x: 1, y: 0, z: 0 },
	{ x: -1, y: 0, z: 0 },
	{ x: 0, y: 1, z: 0 },
	{ x: 0, y: -1, z: 0 }
];

type ExtrudeSourceBlock = Pick<VoxelBlock, 'id' | 'materialId' | 'origin' | 'size'>;

export interface ExtrudePreviewBlock {
	origin: WorldCoord;
	size: number;
}

export interface ExtrudeFacePreview {
	blocks: ExtrudePreviewBlock[];
	normal: WorldCoord;
	signature: string;
}

interface ExtrudeFaceSelection {
	blocks: ExtrudeSourceBlock[];
	preview: ExtrudeFacePreview;
}

interface ExtrudeSession {
	blocks: ExtrudeSourceBlock[];
	normal: WorldCoord;
	facePreview: ExtrudeFacePreview;
	stepCount: number;
	accumulatedDrag: number;
	pendingInitialDeltaReset: boolean;
	previewBlocks: ExtrudePreviewBlock[];
	previewSignature: string | null;
}

let cachedFaceSelection: {
	world: VoxelWorld;
	worldVersion: number;
	normal: WorldCoord;
	blockIds: Set<VoxelBlockId>;
	selection: ExtrudeFaceSelection;
} | null = null;

export class ExtrudeTool implements EditorTool {
	private readonly normalVector = new THREE.Vector3();
	private readonly viewNormal = new THREE.Vector3();
	private readonly screenAxis = new THREE.Vector2();
	private session: ExtrudeSession | null = null;
	private previewMode: EditorMode | null = null;

	begin(context: EditorToolContext, hit: VoxelHit | null): void {
		this.reset(context);

		const selection = resolveExtrudeFaceSelection(context.world, hit);

		if (!selection) {
			return;
		}

		this.session = {
			blocks: selection.blocks,
			normal: { ...selection.preview.normal },
			facePreview: selection.preview,
			stepCount: 0,
			accumulatedDrag: 0,
			pendingInitialDeltaReset: true,
			previewBlocks: [],
			previewSignature: null
		};
	}

	update(context: EditorToolContext): void {
		if (!this.session) {
			return;
		}

		const mouseDelta = this.session.pendingInitialDeltaReset
			? { dx: 0, dy: 0 }
			: context.input.getLastMouseDelta();
		const screenAxis = this.getScreenAxis(context, this.session.normal);
		const projectedDelta = mouseDelta.dx * screenAxis.x + mouseDelta.dy * screenAxis.y;
		const unclampedStepCount = Math.trunc(
			(this.session.accumulatedDrag + projectedDelta) / DRAG_PIXELS_PER_STEP
		);
		const maxPositiveStepCount = this.getMaxPositiveStepCount(context, this.session);

		this.session.pendingInitialDeltaReset = false;
		this.session.accumulatedDrag += projectedDelta;
		this.session.stepCount = THREE.MathUtils.clamp(unclampedStepCount, -1, maxPositiveStepCount);
		this.session.previewBlocks = this.getPreviewBlocksForStep(this.session);
		this.session.previewSignature = createPreviewSignature(this.session.previewBlocks);
		this.previewMode =
			this.session.stepCount > 0 ? 'add' : this.session.stepCount < 0 ? 'remove' : null;
		context.editorState.previewBox = null;
	}

	end(context: EditorToolContext): void {
		const session = this.session;

		if (!session) {
			this.reset(context);
			return;
		}

		if (session.stepCount !== 0) {
			const result = extrudeFaceCommand(context.world, {
				blocks: session.blocks,
				normal: session.normal,
				stepCount: session.stepCount
			});

			if (result.changedVoxelCount > 0) {
				context.commit(result);
			}
		}

		this.reset(context);
	}

	getPreviewMode(): EditorMode | null {
		return this.previewMode;
	}

	getPreviewBlocks(): ReadonlyArray<ExtrudePreviewBlock> {
		return this.session?.previewBlocks ?? [];
	}

	getPreviewSignature(): string | null {
		return this.session?.previewSignature ?? null;
	}

	getFacePreview(): ExtrudeFacePreview | null {
		return this.session?.facePreview ?? null;
	}

	isActive(): boolean {
		return this.session !== null;
	}

	cancel(context: Pick<EditorToolContext, 'editorState'>): void {
		this.reset(context);
	}

	private reset(context: Pick<EditorToolContext, 'editorState'>): void {
		this.session = null;
		this.previewMode = null;
		context.editorState.dragStart = null;
		context.editorState.previewBox = null;
	}

	private getScreenAxis(context: EditorToolContext, normal: WorldCoord): THREE.Vector2 {
		this.normalVector.set(normal.x, normal.y, normal.z);
		this.viewNormal.copy(this.normalVector).transformDirection(context.camera.matrixWorldInverse);
		this.screenAxis.set(this.viewNormal.x, -this.viewNormal.y);

		if (this.screenAxis.lengthSq() <= MIN_SCREEN_AXIS_LENGTH_SQ) {
			this.screenAxis.set(0, -1);
		} else {
			this.screenAxis.normalize();
		}

		return this.screenAxis;
	}

	private getMaxPositiveStepCount(context: EditorToolContext, session: ExtrudeSession): number {
		const stepLimit = Math.max(
			0,
			Math.floor(MAX_EXTRUDE_DISTANCE / (session.blocks[0]?.size ?? 1))
		);
		let stepCount = 0;

		for (let index = 1; index <= stepLimit; index += 1) {
			if (!canPlaceExtrudeLayer(context, session, index)) {
				break;
			}

			stepCount = index;
		}

		return stepCount;
	}

	private getPreviewBlocksForStep(session: ExtrudeSession): ExtrudePreviewBlock[] {
		if (session.stepCount > 0) {
			const previewBlocks: ExtrudePreviewBlock[] = [];

			for (let stepIndex = 1; stepIndex <= session.stepCount; stepIndex += 1) {
				for (const block of session.blocks) {
					previewBlocks.push({
						origin: offsetWorldCoord(block.origin, session.normal, block.size * stepIndex),
						size: block.size
					});
				}
			}

			return previewBlocks;
		}

		if (session.stepCount < 0) {
			return session.blocks.map((block) => ({
				origin: { ...block.origin },
				size: block.size
			}));
		}

		return [];
	}
}

function canPlaceExtrudeLayer(
	context: EditorToolContext,
	session: Pick<ExtrudeSession, 'blocks' | 'normal'>,
	stepIndex: number
): boolean {
	for (const block of session.blocks) {
		const blockOrigin = offsetWorldCoord(block.origin, session.normal, block.size * stepIndex);

		if (
			!context.world.canPlaceBlock(blockOrigin, block.size) ||
			!context.player.canPlaceBlockAt(blockOrigin, block.size)
		) {
			return false;
		}
	}

	return true;
}

export function resolveExtrudeFacePreview(
	world: VoxelWorld,
	hit: VoxelHit | null
): ExtrudeFacePreview | null {
	return resolveExtrudeFaceSelection(world, hit)?.preview ?? null;
}

function resolveExtrudeFaceSelection(
	world: VoxelWorld,
	hit: VoxelHit | null
): ExtrudeFaceSelection | null {
	if (!hit || !isAxisAlignedFaceNormal(hit.normal)) {
		return null;
	}

	const worldVersion = world.getMutationVersion();

	if (
		cachedFaceSelection &&
		cachedFaceSelection.world === world &&
		cachedFaceSelection.worldVersion === worldVersion &&
		areWorldCoordsEqual(cachedFaceSelection.normal, hit.normal) &&
		cachedFaceSelection.blockIds.has(hit.block.id)
	) {
		return cachedFaceSelection.selection;
	}

	const blocks = collectConnectedFaceBlocks(world, hit.block, hit.normal);

	if (blocks.length === 0) {
		cachedFaceSelection = null;
		return null;
	}

	const selection = {
		blocks,
		preview: createExtrudeFacePreview(blocks, hit.normal)
	};

	cachedFaceSelection = {
		world,
		worldVersion,
		normal: { ...hit.normal },
		blockIds: new Set(blocks.map((block) => block.id)),
		selection
	};

	return selection;
}

function collectConnectedFaceBlocks(
	world: VoxelWorld,
	startBlock: Pick<VoxelBlock, 'id' | 'materialId' | 'origin' | 'size'>,
	normal: WorldCoord
): ExtrudeSourceBlock[] {
	const planeCoordinate = getFacePlaneCoordinate(startBlock, normal);
	const visited = new Set<VoxelBlockId>([startBlock.id]);
	const queue: VoxelBlockId[] = [startBlock.id];
	let queueIndex = 0;
	const blocks: ExtrudeSourceBlock[] = [];
	const tangents = getFaceTangentDirections(normal);

	while (queueIndex < queue.length) {
		const currentBlockId = queue[queueIndex++];

		const currentBlock = world.blocks.get(currentBlockId);

		if (!currentBlock) {
			continue;
		}

		const isStartBlock = currentBlock.id === startBlock.id;

		if (
			!isMatchingConnectedFaceBlock(world, startBlock, currentBlock, normal, planeCoordinate) &&
			!isStartBlock
		) {
			continue;
		}

		blocks.push(cloneExtrudeSourceBlock(currentBlock));

		for (const neighborBlockId of getConnectedFaceNeighborBlockIds(
			world,
			currentBlock,
			normal,
			planeCoordinate,
			tangents
		)) {
			if (visited.has(neighborBlockId)) {
				continue;
			}

			visited.add(neighborBlockId);
			queue.push(neighborBlockId);
		}
	}

	return blocks.sort(compareExtrudeSourceBlocks);
}

function getConnectedFaceNeighborBlockIds(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'id' | 'materialId' | 'origin' | 'size'>,
	normal: WorldCoord,
	planeCoordinate: number,
	tangents: ReadonlyArray<WorldCoord>
): VoxelBlockId[] {
	const neighborIds: VoxelBlockId[] = [];

	for (const tangent of tangents) {
		const neighborOrigin = offsetWorldCoord(block.origin, tangent, block.size);
		const neighborBlock = world.getBlockAt(neighborOrigin.x, neighborOrigin.y, neighborOrigin.z);

		if (
			!neighborBlock ||
			neighborBlock.id === block.id ||
			neighborBlock.materialId !== block.materialId ||
			neighborBlock.size !== block.size ||
			getFacePlaneCoordinate(neighborBlock, normal) !== planeCoordinate ||
			!isBlockFaceClear(world, neighborBlock, normal)
		) {
			continue;
		}

		neighborIds.push(neighborBlock.id);
	}

	return neighborIds;
}

function isMatchingConnectedFaceBlock(
	world: VoxelWorld,
	sourceBlock: Pick<VoxelBlock, 'materialId' | 'size'>,
	block: Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>,
	normal: WorldCoord,
	planeCoordinate: number
): boolean {
	return (
		block.materialId === sourceBlock.materialId &&
		block.size === sourceBlock.size &&
		getFacePlaneCoordinate(block, normal) === planeCoordinate &&
		isBlockFaceClear(world, block, normal)
	);
}

function isBlockFaceClear(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'origin' | 'size'>,
	normal: WorldCoord
): boolean {
	if (normal.x !== 0) {
		const x = normal.x > 0 ? block.origin.x + block.size : block.origin.x - 1;

		for (let z = block.origin.z; z < block.origin.z + block.size; z += 1) {
			for (let y = block.origin.y; y < block.origin.y + block.size; y += 1) {
				if (world.getVoxel(x, y, z) !== VOXEL_AIR) {
					return false;
				}
			}
		}

		return true;
	}

	if (normal.y !== 0) {
		const y = normal.y > 0 ? block.origin.y + block.size : block.origin.y - 1;

		for (let z = block.origin.z; z < block.origin.z + block.size; z += 1) {
			for (let x = block.origin.x; x < block.origin.x + block.size; x += 1) {
				if (world.getVoxel(x, y, z) !== VOXEL_AIR) {
					return false;
				}
			}
		}

		return true;
	}

	const z = normal.z > 0 ? block.origin.z + block.size : block.origin.z - 1;

	for (let y = block.origin.y; y < block.origin.y + block.size; y += 1) {
		for (let x = block.origin.x; x < block.origin.x + block.size; x += 1) {
			if (world.getVoxel(x, y, z) !== VOXEL_AIR) {
				return false;
			}
		}
	}

	return true;
}

function getFaceTangentDirections(normal: WorldCoord): ReadonlyArray<WorldCoord> {
	if (normal.x !== 0) {
		return FACE_TANGENTS_X;
	}

	if (normal.y !== 0) {
		return FACE_TANGENTS_Y;
	}

	return FACE_TANGENTS_Z;
}

function getFacePlaneCoordinate(
	block: Pick<VoxelBlock, 'origin' | 'size'>,
	normal: WorldCoord
): number {
	if (normal.x > 0) {
		return block.origin.x + block.size;
	}

	if (normal.x < 0) {
		return block.origin.x;
	}

	if (normal.y > 0) {
		return block.origin.y + block.size;
	}

	if (normal.y < 0) {
		return block.origin.y;
	}

	if (normal.z > 0) {
		return block.origin.z + block.size;
	}

	return block.origin.z;
}

function createExtrudeFacePreview(
	blocks: ReadonlyArray<Pick<VoxelBlock, 'origin' | 'size'>>,
	normal: WorldCoord
): ExtrudeFacePreview {
	return {
		blocks: blocks.map((block) => ({
			origin: { ...block.origin },
			size: block.size
		})),
		normal: { ...normal },
		signature: createFacePreviewSignature(blocks, normal)
	};
}

function createPreviewSignature(blocks: ReadonlyArray<ExtrudePreviewBlock>): string | null {
	if (blocks.length === 0) {
		return null;
	}

	return blocks
		.map((block) => `${block.origin.x},${block.origin.y},${block.origin.z}:${block.size}`)
		.join('|');
}

function createFacePreviewSignature(
	blocks: ReadonlyArray<Pick<VoxelBlock, 'origin' | 'size'>>,
	normal: WorldCoord
): string {
	return `${normal.x},${normal.y},${normal.z}:${blocks
		.map((block) => `${block.origin.x},${block.origin.y},${block.origin.z}:${block.size}`)
		.join('|')}`;
}

function cloneExtrudeSourceBlock(block: ExtrudeSourceBlock): ExtrudeSourceBlock {
	return {
		id: block.id,
		materialId: block.materialId,
		origin: { ...block.origin },
		size: block.size
	};
}

function compareExtrudeSourceBlocks(a: ExtrudeSourceBlock, b: ExtrudeSourceBlock): number {
	if (a.origin.z !== b.origin.z) {
		return a.origin.z - b.origin.z;
	}

	if (a.origin.y !== b.origin.y) {
		return a.origin.y - b.origin.y;
	}

	if (a.origin.x !== b.origin.x) {
		return a.origin.x - b.origin.x;
	}

	return a.id - b.id;
}

function isAxisAlignedFaceNormal(normal: WorldCoord): boolean {
	return (
		Math.abs(normal.x) + Math.abs(normal.y) + Math.abs(normal.z) === 1 &&
		Number.isInteger(normal.x) &&
		Number.isInteger(normal.y) &&
		Number.isInteger(normal.z)
	);
}

function offsetWorldCoord(origin: WorldCoord, normal: WorldCoord, distance: number): WorldCoord {
	return {
		x: origin.x + normal.x * distance,
		y: origin.y + normal.y * distance,
		z: origin.z + normal.z * distance
	};
}

function areWorldCoordsEqual(a: WorldCoord, b: WorldCoord): boolean {
	return a.x === b.x && a.y === b.y && a.z === b.z;
}
