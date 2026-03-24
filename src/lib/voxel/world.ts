import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import { VoxelChunk } from '$lib/voxel/chunk';
import type {
	ChunkCoord,
	ChunkKey,
	LocalCoord,
	VoxelBlock,
	VoxelBlockId,
	VoxelId,
	WorldCoord
} from '$lib/voxel/voxelTypes';

export class VoxelWorld {
	chunks: Map<ChunkKey, VoxelChunk> = new Map();
	blocks: Map<VoxelBlockId, VoxelBlock> = new Map();
	private nextBlockId: VoxelBlockId = 1;

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
		return this.getBlockAt(wx, wy, wz)?.materialId ?? VOXEL_AIR;
	}

	setVoxel(wx: number, wy: number, wz: number, id: VoxelId): boolean {
		const existingBlock = this.getBlockAt(wx, wy, wz);

		if (id === VOXEL_AIR) {
			return this.removeBlockAt(wx, wy, wz) !== null;
		}

		if (
			existingBlock &&
			existingBlock.size === 1 &&
			existingBlock.materialId === id &&
			existingBlock.origin.x === wx &&
			existingBlock.origin.y === wy &&
			existingBlock.origin.z === wz
		) {
			return false;
		}

		if (existingBlock) {
			this.removeBlockById(existingBlock.id);
		}

		return this.placeBlock({ x: wx, y: wy, z: wz }, 1, id) !== null;
	}

	getBlockAt(wx: number, wy: number, wz: number): VoxelBlock | null {
		const blockId = this.getBlockIdAt(wx, wy, wz);
		return blockId === 0 ? null : (this.blocks.get(blockId) ?? null);
	}

	getBlockIdAt(wx: number, wy: number, wz: number): VoxelBlockId {
		const chunkCoord = this.getChunkCoordFromWorld(wx, wy, wz);
		const chunk = this.getChunk(chunkCoord);

		if (!chunk) {
			return 0;
		}

		const local = this.getLocalCoord(wx, wy, wz);
		return chunk.getLocalBlockId(local.x, local.y, local.z);
	}

	canPlaceBlock(origin: WorldCoord, size: number): boolean {
		if (!Number.isInteger(size) || size < 1) {
			return false;
		}

		let canPlace = true;

		this.forEachCellInCube(origin, size, (wx, wy, wz) => {
			if (this.getBlockIdAt(wx, wy, wz) !== 0) {
				canPlace = false;
				return false;
			}

			return true;
		});

		return canPlace;
	}

	placeBlock(origin: WorldCoord, size: number, materialId: VoxelId): VoxelBlock | null {
		if (materialId === VOXEL_AIR || !this.canPlaceBlock(origin, size)) {
			return null;
		}

		const block: VoxelBlock = {
			id: this.nextBlockId++,
			materialId,
			origin: { ...origin },
			size
		};

		this.blocks.set(block.id, block);
		this.forEachCellInCube(block.origin, block.size, (wx, wy, wz) => {
			this.setBlockIdAt(wx, wy, wz, block.id);
			return true;
		});
		this.markChunksDirtyForBlock(block);

		return block;
	}

	removeBlockAt(wx: number, wy: number, wz: number): VoxelBlock | null {
		const block = this.getBlockAt(wx, wy, wz);
		return block ? this.removeBlockById(block.id) : null;
	}

	removeBlockById(blockId: VoxelBlockId): VoxelBlock | null {
		const block = this.blocks.get(blockId);

		if (!block) {
			return null;
		}

		this.blocks.delete(blockId);
		this.forEachCellInCube(block.origin, block.size, (wx, wy, wz) => {
			if (this.getBlockIdAt(wx, wy, wz) === blockId) {
				this.setBlockIdAt(wx, wy, wz, 0);
			}

			return true;
		});
		this.markChunksDirtyForBlock(block);

		return block;
	}

	paintBlockAt(wx: number, wy: number, wz: number, materialId: VoxelId): VoxelBlock | null {
		const block = this.getBlockAt(wx, wy, wz);

		if (!block || materialId === VOXEL_AIR || block.materialId === materialId) {
			return null;
		}

		block.materialId = materialId;
		this.markChunksDirtyForBlock(block);
		return block;
	}

	getBlocks(): Array<Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>> {
		return [...this.blocks.values()].map((block) => ({
			materialId: block.materialId,
			origin: { ...block.origin },
			size: block.size
		}));
	}

	replaceBlocks(
		blocks: ReadonlyArray<Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>>
	): boolean {
		const nextWorld = new VoxelWorld();

		for (const block of blocks) {
			if (!this.isValidBlockDefinition(block)) {
				return false;
			}

			if (!nextWorld.placeBlock(block.origin, block.size, block.materialId)) {
				return false;
			}
		}

		this.chunks = nextWorld.chunks;
		this.blocks = nextWorld.blocks;
		this.nextBlockId = nextWorld.nextBlockId;
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

	collectAffectedChunkKeysForBlock(
		origin: WorldCoord,
		size: number,
		chunkKeys: Set<ChunkKey>
	): void {
		this.forEachCellInCube(origin, size, (wx, wy, wz) => {
			this.collectAffectedChunkKeysForVoxel(wx, wy, wz, chunkKeys);
			return true;
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

	private forEachCellInCube(
		origin: WorldCoord,
		size: number,
		visitor: (wx: number, wy: number, wz: number) => boolean
	): void {
		for (let wz = origin.z; wz < origin.z + size; wz += 1) {
			for (let wy = origin.y; wy < origin.y + size; wy += 1) {
				for (let wx = origin.x; wx < origin.x + size; wx += 1) {
					if (!visitor(wx, wy, wz)) {
						return;
					}
				}
			}
		}
	}

	private setBlockIdAt(wx: number, wy: number, wz: number, blockId: VoxelBlockId): void {
		const chunkCoord = this.getChunkCoordFromWorld(wx, wy, wz);
		const local = this.getLocalCoord(wx, wy, wz);
		const existingChunk = this.getChunk(chunkCoord);

		if (!existingChunk && blockId === 0) {
			return;
		}

		const chunk = existingChunk ?? this.getOrCreateChunk(chunkCoord);
		chunk.setLocalBlockId(local.x, local.y, local.z, blockId);
	}

	private markChunksDirtyForBlock(block: Pick<VoxelBlock, 'origin' | 'size'>): void {
		const affectedChunkKeys = new Set<ChunkKey>();
		this.collectAffectedChunkKeysForBlock(block.origin, block.size, affectedChunkKeys);

		for (const chunkKey of affectedChunkKeys) {
			const chunk = this.getChunkByKey(chunkKey);

			if (chunk) {
				chunk.dirty = true;
			}
		}
	}

	private isValidBlockDefinition(
		block: Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>
	): boolean {
		return (
			Number.isInteger(block.materialId) &&
			block.materialId !== VOXEL_AIR &&
			Number.isInteger(block.size) &&
			block.size > 0 &&
			Number.isInteger(block.origin.x) &&
			Number.isInteger(block.origin.y) &&
			Number.isInteger(block.origin.z)
		);
	}
}
