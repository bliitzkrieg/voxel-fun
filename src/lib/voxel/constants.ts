export const CHUNK_SIZE = 16;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

export const INTERNAL_VOXEL_RESOLUTION = 2;
export const METERS_PER_VOXEL = 0.125;
export const VOXEL_WORLD_SIZE = METERS_PER_VOXEL;
export const VOXELS_PER_METER = 1 / METERS_PER_VOXEL;

export const VOXEL_AIR = 0;
export const VOXEL_SIZE_PRESETS = [1, 2, 4, 6, 8, 10, 12, 14, 16] as const;
export const DEFAULT_VOXEL_SIZE = 8;

export function scaleLegacyVoxelUnits(value: number): number {
	return value * INTERNAL_VOXEL_RESOLUTION;
}

export function getDisplayVoxelSize(size: number): number {
	return size / INTERNAL_VOXEL_RESOLUTION;
}

export function formatVoxelSize(size: number): string {
	const displaySize = getDisplayVoxelSize(size);
	return Number.isInteger(displaySize) ? String(displaySize) : displaySize.toFixed(1);
}
