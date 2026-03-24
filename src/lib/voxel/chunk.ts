import { CHUNK_SIZE, CHUNK_VOLUME } from '$lib/voxel/constants';
import type { ChunkCoord, VoxelBlockId } from '$lib/voxel/voxelTypes';

export class VoxelChunk {
	coord: ChunkCoord;
	blockIds: Uint32Array;
	dirty: boolean;

	constructor(coord: ChunkCoord) {
		this.coord = { ...coord };
		this.blockIds = new Uint32Array(CHUNK_VOLUME);
		this.dirty = true;
	}

	index(x: number, y: number, z: number): number {
		return x + CHUNK_SIZE * (y + CHUNK_SIZE * z);
	}

	inBounds(x: number, y: number, z: number): boolean {
		return x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
	}

	getLocalBlockId(x: number, y: number, z: number): VoxelBlockId {
		if (!this.inBounds(x, y, z)) {
			return 0;
		}

		return this.blockIds[this.index(x, y, z)] ?? 0;
	}

	setLocalBlockId(x: number, y: number, z: number, blockId: VoxelBlockId): void {
		if (!this.inBounds(x, y, z)) {
			return;
		}

		const voxelIndex = this.index(x, y, z);

		if (this.blockIds[voxelIndex] === blockId) {
			return;
		}

		this.blockIds[voxelIndex] = blockId;
		this.dirty = true;
	}
}
