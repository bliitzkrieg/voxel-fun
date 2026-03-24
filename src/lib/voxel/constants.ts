export const CHUNK_SIZE = 16;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE;

export const METERS_PER_VOXEL = 0.25;
export const VOXEL_WORLD_SIZE = METERS_PER_VOXEL;
export const VOXELS_PER_METER = 1 / METERS_PER_VOXEL;

export const VOXEL_AIR = 0;
export const VOXEL_SIZE_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const DEFAULT_VOXEL_SIZE = 4;
