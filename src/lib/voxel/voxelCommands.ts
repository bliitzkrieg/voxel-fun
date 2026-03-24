import { VOXEL_AIR } from '$lib/voxel/constants';
import type {
	ChunkKey,
	VoxelBlock,
	VoxelBlockId,
	VoxelId,
	WorldBox,
	WorldCoord
} from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

export interface VoxelCommandResult {
	affectedChunkKeys: Set<ChunkKey>;
	changedVoxelCount: number;
}

export interface PaintCommandOptions {
	allowAirWrite?: boolean;
}

export function createVoxelCommandResult(): VoxelCommandResult {
	return {
		affectedChunkKeys: new Set<ChunkKey>(),
		changedVoxelCount: 0
	};
}

export function mergeVoxelCommandResult(
	target: VoxelCommandResult,
	source: VoxelCommandResult
): VoxelCommandResult {
	for (const chunkKey of source.affectedChunkKeys) {
		target.affectedChunkKeys.add(chunkKey);
	}

	target.changedVoxelCount += source.changedVoxelCount;
	return target;
}

export function normalizeWorldBox(a: WorldCoord, b: WorldCoord): WorldBox {
	return {
		min: {
			x: Math.min(a.x, b.x),
			y: Math.min(a.y, b.y),
			z: Math.min(a.z, b.z)
		},
		max: {
			x: Math.max(a.x, b.x),
			y: Math.max(a.y, b.y),
			z: Math.max(a.z, b.z)
		}
	};
}

export function setVoxelCommand(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	voxelId: VoxelId,
	size = 1
): VoxelCommandResult {
	const result = createVoxelCommandResult();
	applyBlockWrite(world, { x, y, z }, size, voxelId, result);
	return result;
}

export function paintVoxelCommand(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	voxelId: VoxelId,
	options: PaintCommandOptions = {}
): VoxelCommandResult {
	const result = createVoxelCommandResult();
	applyBlockPaint(world, x, y, z, voxelId, result, options);
	return result;
}

export function fillBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId,
	size = 1
): VoxelCommandResult {
	return applyBox(world, min, max, size, (x, y, z, result) => {
		applyBlockWrite(world, { x, y, z }, size, voxelId, result);
	});
}

export function hollowBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId,
	size = 1
): VoxelCommandResult {
	return applyBox(world, min, max, size, (x, y, z, result, bounds) => {
		const blockMaxX = x + size - 1;
		const blockMaxY = y + size - 1;
		const blockMaxZ = z + size - 1;
		const isBoundary =
			x === bounds.min.x ||
			blockMaxX >= bounds.max.x ||
			y === bounds.min.y ||
			blockMaxY >= bounds.max.y ||
			z === bounds.min.z ||
			blockMaxZ >= bounds.max.z;

		if (isBoundary) {
			applyBlockWrite(world, { x, y, z }, size, voxelId, result);
		}
	});
}

export function carveBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord
): VoxelCommandResult {
	const result = createVoxelCommandResult();
	const bounds = normalizeWorldBox(min, max);
	const targetedBlockIds = collectBlockIdsInBox(world, bounds);

	for (const blockId of targetedBlockIds) {
		applyBlockRemoveById(world, blockId, result);
	}

	return result;
}

export function paintBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId,
	options: PaintCommandOptions = {}
): VoxelCommandResult {
	const result = createVoxelCommandResult();
	const bounds = normalizeWorldBox(min, max);

	for (const blockId of collectBlockIdsInBox(world, bounds)) {
		applyBlockPaintById(world, blockId, voxelId, result, options);
	}

	return result;
}

type BoxVisitor = (
	x: number,
	y: number,
	z: number,
	result: VoxelCommandResult,
	bounds: WorldBox
) => void;

function applyBox(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	step: number,
	visitor: BoxVisitor
): VoxelCommandResult {
	const bounds = normalizeWorldBox(min, max);
	const result = createVoxelCommandResult();

	for (let z = bounds.min.z; z <= bounds.max.z; z += step) {
		for (let y = bounds.min.y; y <= bounds.max.y; y += step) {
			for (let x = bounds.min.x; x <= bounds.max.x; x += step) {
				if (
					x + step - 1 > bounds.max.x ||
					y + step - 1 > bounds.max.y ||
					z + step - 1 > bounds.max.z
				) {
					continue;
				}

				visitor(x, y, z, result, bounds);
			}
		}
	}

	return result;
}

function applyBlockWrite(
	world: VoxelWorld,
	origin: WorldCoord,
	size: number,
	voxelId: VoxelId,
	result: VoxelCommandResult
): void {
	if (voxelId === VOXEL_AIR) {
		applyBlockRemove(world, origin.x, origin.y, origin.z, result);
		return;
	}

	const block = world.placeBlock(origin, size, voxelId);

	if (!block) {
		return;
	}

	recordChangedBlock(world, block, result);
}

function applyBlockRemove(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	result: VoxelCommandResult
): void {
	const block = world.removeBlockAt(x, y, z);

	if (!block) {
		return;
	}

	recordChangedBlock(world, block, result);
}

function applyBlockRemoveById(
	world: VoxelWorld,
	blockId: VoxelBlockId,
	result: VoxelCommandResult
): void {
	const block = world.removeBlockById(blockId);

	if (!block) {
		return;
	}

	recordChangedBlock(world, block, result);
}

function applyBlockPaint(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	voxelId: VoxelId,
	result: VoxelCommandResult,
	options: PaintCommandOptions
): void {
	const currentVoxelId = world.getVoxel(x, y, z);

	if (currentVoxelId === VOXEL_AIR && !(options.allowAirWrite && voxelId === VOXEL_AIR)) {
		return;
	}

	if (voxelId === VOXEL_AIR && !options.allowAirWrite) {
		return;
	}

	applyBlockPaintById(world, world.getBlockIdAt(x, y, z), voxelId, result, options);
}

function applyBlockPaintById(
	world: VoxelWorld,
	blockId: VoxelBlockId,
	voxelId: VoxelId,
	result: VoxelCommandResult,
	options: PaintCommandOptions
): void {
	if (blockId === 0) {
		return;
	}

	if (voxelId === VOXEL_AIR && !options.allowAirWrite) {
		return;
	}

	const block =
		voxelId === VOXEL_AIR
			? world.removeBlockById(blockId)
			: paintOrReplaceBlock(world, blockId, voxelId);

	if (!block) {
		return;
	}

	recordChangedBlock(world, block, result);
}

function paintOrReplaceBlock(
	world: VoxelWorld,
	blockId: VoxelBlockId,
	voxelId: VoxelId
): VoxelBlock | null {
	const block = world.blocks.get(blockId);

	if (!block) {
		return null;
	}

	return world.paintBlockAt(block.origin.x, block.origin.y, block.origin.z, voxelId);
}

function recordChangedBlock(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'origin' | 'size'>,
	result: VoxelCommandResult
): void {
	world.collectAffectedChunkKeysForBlock(block.origin, block.size, result.affectedChunkKeys);
	result.changedVoxelCount += block.size ** 3;
}

function collectBlockIdsInBox(world: VoxelWorld, bounds: WorldBox): Set<VoxelBlockId> {
	const blockIds = new Set<VoxelBlockId>();

	for (let z = bounds.min.z; z <= bounds.max.z; z += 1) {
		for (let y = bounds.min.y; y <= bounds.max.y; y += 1) {
			for (let x = bounds.min.x; x <= bounds.max.x; x += 1) {
				const blockId = world.getBlockIdAt(x, y, z);

				if (blockId !== 0) {
					blockIds.add(blockId);
				}
			}
		}
	}

	return blockIds;
}
