import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import { VoxelChunk } from '$lib/voxel/chunk';
import type { ChunkCoord, ChunkKey, LocalCoord, VoxelId } from '$lib/voxel/voxelTypes';

export class VoxelWorld {
	chunks: Map<ChunkKey, VoxelChunk> = new Map();

	getChunkKey(x: number, y: number, z: number): ChunkKey {
		return `${x},${y},${z}`;
	}

	getChunk(coord: ChunkCoord): VoxelChunk | undefined {
		return this.chunks.get(this.getChunkKey(coord.x, coord.y, coord.z));
	}

	getChunkByKey(key: ChunkKey): VoxelChunk | undefined {
		return this.chunks.get(key);
	}

	getOrCreateChunk(coord: ChunkCoord): VoxelChunk {
		const key = this.getChunkKey(coord.x, coord.y, coord.z);
		let chunk = this.chunks.get(key);

		if (!chunk) {
			chunk = new VoxelChunk(coord);
			this.chunks.set(key, chunk);
		}

		return chunk;
	}

	getChunkCoordFromWorld(wx: number, wy: number, wz: number): ChunkCoord {
		return {
			x: Math.floor(wx / CHUNK_SIZE),
			y: Math.floor(wy / CHUNK_SIZE),
			z: Math.floor(wz / CHUNK_SIZE)
		};
	}

	getLocalCoord(wx: number, wy: number, wz: number): LocalCoord {
		const chunk = this.getChunkCoordFromWorld(wx, wy, wz);

		return {
			x: wx - chunk.x * CHUNK_SIZE,
			y: wy - chunk.y * CHUNK_SIZE,
			z: wz - chunk.z * CHUNK_SIZE
		};
	}

	getVoxel(wx: number, wy: number, wz: number): VoxelId {
		const chunkCoord = this.getChunkCoordFromWorld(wx, wy, wz);
		const chunk = this.getChunk(chunkCoord);

		if (!chunk) {
			return VOXEL_AIR;
		}

		const local = this.getLocalCoord(wx, wy, wz);
		return chunk.getLocal(local.x, local.y, local.z);
	}

	setVoxel(wx: number, wy: number, wz: number, id: VoxelId): boolean {
		const chunkCoord = this.getChunkCoordFromWorld(wx, wy, wz);
		const local = this.getLocalCoord(wx, wy, wz);
		const existingChunk = this.getChunk(chunkCoord);

		if (!existingChunk && id === VOXEL_AIR) {
			return false;
		}

		const chunk = existingChunk ?? this.getOrCreateChunk(chunkCoord);
		const previousId = chunk.getLocal(local.x, local.y, local.z);

		if (previousId === id) {
			return false;
		}

		chunk.setLocal(local.x, local.y, local.z, id);
		this.forAffectedChunkCoords(chunkCoord, local, (coord) => {
			this.markChunkDirty(coord);
		});
		return true;
	}

	markChunkDirty(coord: ChunkCoord): void {
		const chunk = this.getChunk(coord);

		if (chunk) {
			chunk.dirty = true;
		}
	}

	getDirtyChunks(chunkKeys?: Iterable<ChunkKey>): VoxelChunk[] {
		if (!chunkKeys) {
			return [...this.chunks.values()].filter((chunk) => chunk.dirty);
		}

		const dirtyChunks: VoxelChunk[] = [];

		for (const key of chunkKeys) {
			const chunk = this.chunks.get(key);

			if (chunk?.dirty) {
				dirtyChunks.push(chunk);
			}
		}

		return dirtyChunks;
	}

	clearDirty(chunk: VoxelChunk): void {
		chunk.dirty = false;
	}

	collectAffectedChunkKeysForVoxel(
		wx: number,
		wy: number,
		wz: number,
		chunkKeys: Set<ChunkKey>
	): void {
		const chunkCoord = this.getChunkCoordFromWorld(wx, wy, wz);
		const local = this.getLocalCoord(wx, wy, wz);

		this.forAffectedChunkCoords(chunkCoord, local, (coord) => {
			chunkKeys.add(this.getChunkKey(coord.x, coord.y, coord.z));
		});
	}

	private forAffectedChunkCoords(
		coord: ChunkCoord,
		local: LocalCoord,
		visitor: (coord: ChunkCoord) => void
	): void {
		visitor(coord);

		if (local.x === 0) {
			visitor({ x: coord.x - 1, y: coord.y, z: coord.z });
		}

		if (local.x === CHUNK_SIZE - 1) {
			visitor({ x: coord.x + 1, y: coord.y, z: coord.z });
		}

		if (local.y === 0) {
			visitor({ x: coord.x, y: coord.y - 1, z: coord.z });
		}

		if (local.y === CHUNK_SIZE - 1) {
			visitor({ x: coord.x, y: coord.y + 1, z: coord.z });
		}

		if (local.z === 0) {
			visitor({ x: coord.x, y: coord.y, z: coord.z - 1 });
		}

		if (local.z === CHUNK_SIZE - 1) {
			visitor({ x: coord.x, y: coord.y, z: coord.z + 1 });
		}
	}
}
