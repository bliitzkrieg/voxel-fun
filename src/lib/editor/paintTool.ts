import {
	createVoxelCommandResult,
	paintBoxCommand,
	paintVoxelCommand,
	type PaintCommandOptions
} from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelId, WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

export function paintHitVoxel(
	world: VoxelWorld,
	hit: VoxelHit | null,
	voxelId: VoxelId,
	options: PaintCommandOptions = {}
) {
	if (!hit) {
		return createVoxelCommandResult();
	}

	return paintVoxelCommand(world, hit.voxel.x, hit.voxel.y, hit.voxel.z, voxelId, options);
}

export function paintRegion(
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: VoxelId,
	options: PaintCommandOptions = {}
) {
	return paintBoxCommand(world, min, max, voxelId, options);
}
