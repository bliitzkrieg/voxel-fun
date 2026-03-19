import { CHUNK_SIZE, CHUNK_VOLUME, VOXEL_AIR } from '$lib/voxel/constants';
import type { ChunkCoord, VoxelId } from '$lib/voxel/voxelTypes';

export class VoxelChunk {
	coord: ChunkCoord;
	voxels: Uint16Array;
	dirty: boolean;

	constructor(coord: ChunkCoord) {
		this.coord = { ...coord };
		this.voxels = new Uint16Array(CHUNK_VOLUME);
		this.dirty = true;
	}

	index(x: number, y: number, z: number): number {
		return x + CHUNK_SIZE * (y + CHUNK_SIZE * z);
	}

	inBounds(x: number, y: number, z: number): boolean {
		return x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
	}

	getLocal(x: number, y: number, z: number): VoxelId {
		if (!this.inBounds(x, y, z)) {
			return VOXEL_AIR;
		}

		return this.voxels[this.index(x, y, z)] ?? VOXEL_AIR;
	}

	setLocal(x: number, y: number, z: number, id: VoxelId): void {
		if (!this.inBounds(x, y, z)) {
			return;
		}

		const voxelIndex = this.index(x, y, z);

		if (this.voxels[voxelIndex] === id) {
			return;
		}

		this.voxels[voxelIndex] = id;
		this.dirty = true;
	}

	fill(id: VoxelId): void {
		this.voxels.fill(id);
		this.dirty = true;
	}
}
