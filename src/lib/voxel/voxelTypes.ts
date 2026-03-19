export type ChunkKey = string;
export type VoxelId = number;

export interface ChunkCoord {
	x: number;
	y: number;
	z: number;
}

export interface WorldCoord {
	x: number;
	y: number;
	z: number;
}

export interface WorldBox {
	min: WorldCoord;
	max: WorldCoord;
}

export interface LocalCoord {
	x: number;
	y: number;
	z: number;
}
