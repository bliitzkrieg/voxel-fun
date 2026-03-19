import { VOXEL_AIR } from '$lib/voxel/constants';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelId } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

export function removeVoxel(world: VoxelWorld, hit: VoxelHit): void {
	world.setVoxel(hit.voxel.x, hit.voxel.y, hit.voxel.z, VOXEL_AIR);
}

export function placeVoxel(world: VoxelWorld, hit: VoxelHit, id: VoxelId): void {
	world.setVoxel(
		hit.voxel.x + hit.normal.x,
		hit.voxel.y + hit.normal.y,
		hit.voxel.z + hit.normal.z,
		id
	);
}
