import { VOXEL_AIR } from '$lib/voxel/constants';
import type { ChunkKey, VoxelId, WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
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
	voxelId: VoxelId
): VoxelCommandResult {
	const result = createVoxelCommandResult();
	applyVoxelWrite(world, x, y, z, voxelId, result);
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
	applyVoxelPaint(world, x, y, z, voxelId, result, options);
	return result;
}

export function fillBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId
): VoxelCommandResult {
	return applyBox(world, min, max, (x, y, z, result) => {
		applyVoxelWrite(world, x, y, z, voxelId, result);
	});
}

export function hollowBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId
): VoxelCommandResult {
	return applyBox(world, min, max, (x, y, z, result, bounds) => {
		const isBoundary =
			x === bounds.min.x ||
			x === bounds.max.x ||
			y === bounds.min.y ||
			y === bounds.max.y ||
			z === bounds.min.z ||
			z === bounds.max.z;

		if (isBoundary) {
			applyVoxelWrite(world, x, y, z, voxelId, result);
		}
	});
}

export function carveBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord
): VoxelCommandResult {
	return applyBox(world, min, max, (x, y, z, result) => {
		applyVoxelWrite(world, x, y, z, VOXEL_AIR, result);
	});
}

export function paintBoxCommand(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId,
	options: PaintCommandOptions = {}
): VoxelCommandResult {
	return applyBox(world, min, max, (x, y, z, result) => {
		applyVoxelPaint(world, x, y, z, voxelId, result, options);
	});
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
	visitor: BoxVisitor
): VoxelCommandResult {
	const bounds = normalizeWorldBox(min, max);
	const result = createVoxelCommandResult();

	for (let z = bounds.min.z; z <= bounds.max.z; z += 1) {
		for (let y = bounds.min.y; y <= bounds.max.y; y += 1) {
			for (let x = bounds.min.x; x <= bounds.max.x; x += 1) {
				visitor(x, y, z, result, bounds);
			}
		}
	}

	return result;
}

function applyVoxelWrite(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	voxelId: VoxelId,
	result: VoxelCommandResult
): void {
	if (!world.setVoxel(x, y, z, voxelId)) {
		return;
	}

	world.collectAffectedChunkKeysForVoxel(x, y, z, result.affectedChunkKeys);
	result.changedVoxelCount += 1;
}

function applyVoxelPaint(
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

	applyVoxelWrite(world, x, y, z, voxelId, result);
}
