export type ChunkKey = string;
export type VoxelId = number;
export type VoxelBlockId = number;

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

export interface VoxelBlock {
	id: VoxelBlockId;
	materialId: VoxelId;
	origin: WorldCoord;
	size: number;
}

export function createWorldBox(min: WorldCoord, max: WorldCoord): WorldBox {
	return {
		min: { ...min },
		max: { ...max }
	};
}

export function createVoxelBlockBox(block: Pick<VoxelBlock, 'origin' | 'size'>): WorldBox {
	return createWorldBox(block.origin, {
		x: block.origin.x + block.size - 1,
		y: block.origin.y + block.size - 1,
		z: block.origin.z + block.size - 1
	});
}
