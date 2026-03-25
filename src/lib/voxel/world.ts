import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import { VoxelChunk } from '$lib/voxel/chunk';
import { isWaterVoxelMaterial } from '$lib/voxel/voxelPalette';
import type {
	ChunkCoord,
	ChunkKey,
	LocalCoord,
	PropDefinitionBlock,
	PropId,
	PropInstance,
	PropInstanceId,
	PropInstanceRotation,
	VoxelBlock,
	VoxelBlockId,
	VoxelId,
	WorldCoord
} from '$lib/voxel/voxelTypes';

export interface SerializedWorldBlock {
	materialId: VoxelId;
	origin: WorldCoord;
	size: number;
	propInstanceId: PropInstanceId | null;
}

export interface SerializedWorldPropInstance {
	id: PropInstanceId;
	propId: PropId;
	origin: WorldCoord;
	rotationQuarterTurns: PropInstanceRotation;
}

export class VoxelWorld {
	chunks: Map<ChunkKey, VoxelChunk> = new Map();
	blocks: Map<VoxelBlockId, VoxelBlock> = new Map();
	propInstances: Map<PropInstanceId, PropInstance> = new Map();

	private nextBlockId: VoxelBlockId = 1;
	private nextPropInstanceId: PropInstanceId = 1;

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

		if (existingBlock && existingBlock.propInstanceId !== null) {
			this.detachPropInstance(existingBlock.propInstanceId);
		}

		const nextExistingBlock = this.getBlockAt(wx, wy, wz);

		if (id === VOXEL_AIR) {
			return this.removeBlockAt(wx, wy, wz) !== null;
		}

		if (
			nextExistingBlock &&
			nextExistingBlock.size === 1 &&
			nextExistingBlock.materialId === id &&
			nextExistingBlock.origin.x === wx &&
			nextExistingBlock.origin.y === wy &&
			nextExistingBlock.origin.z === wz
		) {
			return false;
		}

		if (nextExistingBlock) {
			this.removeBlockById(nextExistingBlock.id);
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

	getPropInstance(propInstanceId: PropInstanceId): PropInstance | null {
		return this.propInstances.get(propInstanceId) ?? null;
	}

	getPropInstanceAt(wx: number, wy: number, wz: number): PropInstance | null {
		const block = this.getBlockAt(wx, wy, wz);
		return block && block.propInstanceId !== null
			? this.getPropInstance(block.propInstanceId)
			: null;
	}

	canPlaceBlock(origin: WorldCoord, size: number): boolean {
		if (!Number.isInteger(size) || size < 1) {
			return false;
		}

		return this.getOverlappingBlockIds(origin, size).size === 0;
	}

	canPlaceBlockIgnoringWater(origin: WorldCoord, size: number): boolean {
		if (!Number.isInteger(size) || size < 1) {
			return false;
		}

		for (const blockId of this.getOverlappingBlockIds(origin, size)) {
			const block = this.blocks.get(blockId);

			if (block && !isWaterVoxelMaterial(block.materialId)) {
				return false;
			}
		}

		return true;
	}

	placeBlock(
		origin: WorldCoord,
		size: number,
		materialId: VoxelId,
		propInstanceId: PropInstanceId | null = null
	): VoxelBlock | null {
		if (materialId === VOXEL_AIR || !this.canPlaceBlock(origin, size)) {
			return null;
		}

		const block: VoxelBlock = {
			id: this.nextBlockId++,
			materialId,
			origin: { ...origin },
			size,
			propInstanceId
		};

		this.blocks.set(block.id, block);
		this.forEachCellInCube(block.origin, block.size, (wx, wy, wz) => {
			this.setBlockIdAt(wx, wy, wz, block.id);
			return true;
		});
		this.markChunksDirtyForBlock(block);

		return block;
	}

	placePropInstance(
		propId: PropId,
		origin: WorldCoord,
		rotationQuarterTurns: PropInstanceRotation,
		blocks: ReadonlyArray<PropDefinitionBlock>,
		options: { displaceWater?: boolean } = {}
	): PropInstance | null {
		if (!blocks.length) {
			return null;
		}

		const overlappingWaterBlockIds = new Set<VoxelBlockId>();

		for (const block of blocks) {
			const canPlace = options.displaceWater
				? this.canPlaceBlockIgnoringWater(block.origin, block.size)
				: this.canPlaceBlock(block.origin, block.size);

			if (!canPlace) {
				return null;
			}

			if (!options.displaceWater) {
				continue;
			}

			for (const waterBlock of this.getOverlappingWaterBlocks(block.origin, block.size)) {
				overlappingWaterBlockIds.add(waterBlock.id);
			}
		}

		for (const blockId of overlappingWaterBlockIds) {
			this.removeBlockById(blockId);
		}

		const propInstance: PropInstance = {
			id: this.nextPropInstanceId++,
			propId,
			origin: { ...origin },
			rotationQuarterTurns: { ...rotationQuarterTurns }
		};

		this.propInstances.set(propInstance.id, propInstance);

		for (const block of blocks) {
			const placedBlock = this.placeBlock(
				block.origin,
				block.size,
				block.materialId,
				propInstance.id
			);

			if (!placedBlock) {
				this.removePropInstance(propInstance.id);
				return null;
			}
		}

		return propInstance;
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

	removePropInstance(propInstanceId: PropInstanceId): PropInstance | null {
		const propInstance = this.propInstances.get(propInstanceId);

		if (!propInstance) {
			return null;
		}

		for (const blockId of this.getPropInstanceBlockIds(propInstanceId)) {
			this.removeBlockById(blockId);
		}

		this.propInstances.delete(propInstanceId);
		return propInstance;
	}

	removePropInstancesByPropId(propId: PropId): PropInstance[] {
		const removedInstances: PropInstance[] = [];

		for (const propInstance of [...this.propInstances.values()]) {
			if (propInstance.propId !== propId) {
				continue;
			}

			const removed = this.removePropInstance(propInstance.id);

			if (removed) {
				removedInstances.push(removed);
			}
		}

		return removedInstances;
	}

	detachPropInstance(propInstanceId: PropInstanceId): PropInstance | null {
		const propInstance = this.propInstances.get(propInstanceId);

		if (!propInstance) {
			return null;
		}

		for (const blockId of this.getPropInstanceBlockIds(propInstanceId)) {
			const block = this.blocks.get(blockId);

			if (!block || block.propInstanceId === null) {
				continue;
			}

			block.propInstanceId = null;
			this.markChunksDirtyForBlock(block);
		}

		this.propInstances.delete(propInstanceId);
		return propInstance;
	}

	getPropInstanceBlockIds(propInstanceId: PropInstanceId): Set<VoxelBlockId> {
		const blockIds = new Set<VoxelBlockId>();

		for (const block of this.blocks.values()) {
			if (block.propInstanceId === propInstanceId) {
				blockIds.add(block.id);
			}
		}

		return blockIds;
	}

	getOverlappingWaterBlocks(origin: WorldCoord, size: number): VoxelBlock[] {
		const overlappingBlocks: VoxelBlock[] = [];

		for (const blockId of this.getOverlappingBlockIds(origin, size)) {
			const block = this.blocks.get(blockId);

			if (block && isWaterVoxelMaterial(block.materialId)) {
				overlappingBlocks.push(block);
			}
		}

		return overlappingBlocks;
	}

	getOverlappingBlocks(origin: WorldCoord, size: number): VoxelBlock[] {
		const overlappingBlocks: VoxelBlock[] = [];

		for (const blockId of this.getOverlappingBlockIds(origin, size)) {
			const block = this.blocks.get(blockId);

			if (block) {
				overlappingBlocks.push(block);
			}
		}

		return overlappingBlocks;
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

	getBlocks(): SerializedWorldBlock[] {
		return [...this.blocks.values()].map((block) => ({
			materialId: block.materialId,
			origin: { ...block.origin },
			size: block.size,
			propInstanceId: block.propInstanceId
		}));
	}

	getPropInstances(): SerializedWorldPropInstance[] {
		return [...this.propInstances.values()].map((propInstance) => ({
			id: propInstance.id,
			propId: propInstance.propId,
			origin: { ...propInstance.origin },
			rotationQuarterTurns: { ...propInstance.rotationQuarterTurns }
		}));
	}

	getReferencedMaterialIds(): Set<VoxelId> {
		const materialIds = new Set<VoxelId>();

		for (const block of this.blocks.values()) {
			materialIds.add(block.materialId);
		}

		return materialIds;
	}

	hasMaterialReference(materialId: VoxelId): boolean {
		for (const block of this.blocks.values()) {
			if (block.materialId === materialId) {
				return true;
			}
		}

		return false;
	}

	replaceBlocks(blocks: ReadonlyArray<SerializedWorldBlock>): boolean {
		return this.replaceState(blocks, []);
	}

	replaceState(
		blocks: ReadonlyArray<SerializedWorldBlock>,
		propInstances: ReadonlyArray<SerializedWorldPropInstance>
	): boolean {
		const nextWorld = new VoxelWorld();

		for (const propInstance of propInstances) {
			if (!this.isValidPropInstanceDefinition(propInstance)) {
				return false;
			}

			nextWorld.propInstances.set(propInstance.id, {
				id: propInstance.id,
				propId: propInstance.propId,
				origin: { ...propInstance.origin },
				rotationQuarterTurns: { ...propInstance.rotationQuarterTurns }
			});
			nextWorld.nextPropInstanceId = Math.max(nextWorld.nextPropInstanceId, propInstance.id + 1);
		}

		for (const block of blocks) {
			if (!this.isValidBlockDefinition(block)) {
				return false;
			}

			if (block.propInstanceId !== null && !nextWorld.propInstances.has(block.propInstanceId)) {
				return false;
			}

			if (!nextWorld.placeBlock(block.origin, block.size, block.materialId, block.propInstanceId)) {
				return false;
			}
		}

		if (!nextWorld.hasConsistentPropInstanceLinks()) {
			return false;
		}

		this.chunks = nextWorld.chunks;
		this.blocks = nextWorld.blocks;
		this.propInstances = nextWorld.propInstances;
		this.nextBlockId = nextWorld.nextBlockId;
		this.nextPropInstanceId = nextWorld.nextPropInstanceId;
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

	private hasConsistentPropInstanceLinks(): boolean {
		for (const block of this.blocks.values()) {
			if (block.propInstanceId !== null && !this.propInstances.has(block.propInstanceId)) {
				return false;
			}
		}

		return true;
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

	private getOverlappingBlockIds(origin: WorldCoord, size: number): Set<VoxelBlockId> {
		const blockIds = new Set<VoxelBlockId>();

		this.forEachCellInCube(origin, size, (wx, wy, wz) => {
			const blockId = this.getBlockIdAt(wx, wy, wz);

			if (blockId !== 0) {
				blockIds.add(blockId);
			}

			return true;
		});

		return blockIds;
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

	private isValidBlockDefinition(block: SerializedWorldBlock): boolean {
		return (
			Number.isInteger(block.materialId) &&
			block.materialId !== VOXEL_AIR &&
			Number.isInteger(block.size) &&
			block.size > 0 &&
			Number.isInteger(block.origin.x) &&
			Number.isInteger(block.origin.y) &&
			Number.isInteger(block.origin.z) &&
			(block.propInstanceId === null ||
				(Number.isInteger(block.propInstanceId) && block.propInstanceId > 0))
		);
	}

	private isValidPropInstanceDefinition(propInstance: SerializedWorldPropInstance): boolean {
		return (
			Number.isInteger(propInstance.id) &&
			propInstance.id > 0 &&
			Number.isInteger(propInstance.propId) &&
			propInstance.propId > 0 &&
			Number.isInteger(propInstance.origin.x) &&
			Number.isInteger(propInstance.origin.y) &&
			Number.isInteger(propInstance.origin.z) &&
			Number.isInteger(propInstance.rotationQuarterTurns.x) &&
			Number.isInteger(propInstance.rotationQuarterTurns.y) &&
			Number.isInteger(propInstance.rotationQuarterTurns.z)
		);
	}
}
