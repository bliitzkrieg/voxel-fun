import * as THREE from 'three';

import {
	NATURE_BASE_VOXEL_SIZE,
	NATURE_DETAIL_VOXEL_SIZE,
	getNatureGridValue,
	natureUnitsToWorld,
	snapNatureGridCoord
} from '$lib/nature/natureGrid';
import { getNatureMaterialSet } from '$lib/nature/natureMaterials';
import type {
	NatureFlowerColorMode,
	NatureFlowerSettings,
	NatureGrassHeightVariance,
	NatureGrassSettings,
	NatureTreeSettings
} from '$lib/nature/natureTypes';
import type { PlayerController } from '$lib/player/playerController';
import { createVoxelCommandResult, type VoxelCommandResult } from '$lib/voxel/voxelCommands';
import {
	getNatureMaterialIds,
	isNatureFlowerMaterial,
	isNatureGrassMaterial,
	isNatureLeafMaterial,
	isNatureMaterial,
	isWaterVoxelMaterial
} from '$lib/voxel/voxelPalette';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelBlock, WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const MAX_GRASS_HEIGHT = 4;
const FLOWER_MIN_STEM_HEIGHT = 2;
const FLOWER_MAX_STEM_HEIGHT = 4;
const GROUND_SEARCH_UP = natureUnitsToWorld(4);
const GROUND_SEARCH_DOWN = natureUnitsToWorld(14);
const TREE_SCALE = 2.5;
const MAX_GRASS_CLEAR_HEIGHT = MAX_GRASS_HEIGHT * NATURE_BASE_VOXEL_SIZE + NATURE_BASE_VOXEL_SIZE;
const MAX_FLOWER_CLEAR_HEIGHT = FLOWER_MAX_STEM_HEIGHT * NATURE_BASE_VOXEL_SIZE + 4;

export interface NatureGroundAnchor {
	x: number;
	z: number;
	surfaceY: number;
}

export interface GeneratedNatureVoxel {
	origin: WorldCoord;
	materialId: number;
	size: number;
}

export interface NatureTreePreview {
	anchor: NatureGroundAnchor | null;
	blocks: GeneratedNatureVoxel[];
	valid: boolean;
	signature: string | null;
	bounds: WorldBox | null;
}

export function resolveNatureGroundAnchor(
	world: VoxelWorld,
	hit: VoxelHit | null
): NatureGroundAnchor | null {
	if (!hit) {
		return null;
	}

	const columnX = snapNatureGridCoord(hit.voxel.x);
	const columnZ = snapNatureGridCoord(hit.voxel.z);

	if (hit.normal.y === 1 && isValidNatureGroundBlock(hit.block)) {
		return {
			x: columnX,
			z: columnZ,
			surfaceY: hit.block.origin.y + hit.block.size - 1
		};
	}

	if (isNatureMaterial(hit.block.materialId)) {
		return findGroundAnchorForColumn(world, columnX, columnZ, hit.block.origin.y - 1);
	}

	return null;
}

export function paintNatureGrass(
	world: VoxelWorld,
	player: PlayerController,
	hit: VoxelHit | null,
	settings: NatureGrassSettings
): VoxelCommandResult {
	const anchor = resolveNatureGroundAnchor(world, hit);
	const grassMaterialIds = getNatureMaterialIds('grass');
	const result = createVoxelCommandResult();

	if (!anchor || grassMaterialIds.length === 0) {
		return result;
	}

	const visitedColumns = new Set<string>();
	const affectedBlockIds = new Set<number>();
	const radius = settings.radius;
	const radiusSq = (radius + 0.45) ** 2;
	const anchorGridX = getNatureGridValue(anchor.x);
	const anchorGridZ = getNatureGridValue(anchor.z);
	const brushSeed = settings.seedOffset * 17 + getNatureGridValue(anchor.surfaceY) * 13;

	for (let dz = -radius; dz <= radius; dz += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const distanceSq = dx * dx + dz * dz;

			if (distanceSq > radiusSq) {
				continue;
			}

			const x = anchor.x + natureUnitsToWorld(dx);
			const z = anchor.z + natureUnitsToWorld(dz);
			const columnKey = `${x},${z}`;
			const gridX = anchorGridX + dx;
			const gridZ = anchorGridZ + dz;

			if (visitedColumns.has(columnKey)) {
				continue;
			}

			visitedColumns.add(columnKey);

			const columnAnchor = findGroundAnchorForColumn(world, x, z, anchor.surfaceY);

			if (!columnAnchor) {
				continue;
			}

			clearNatureGrassColumn(world, columnAnchor, result, affectedBlockIds);

			const falloff = Math.max(0, 1 - Math.sqrt(distanceSq) / (radius + 0.45));
			const columnSurfaceGridY = getNatureGridValue(columnAnchor.surfaceY);
			const clusterNoise = hash01(Math.floor(gridX * 0.5), 0, Math.floor(gridZ * 0.5), brushSeed);
			const placementNoise = hash01(gridX, columnSurfaceGridY, gridZ, brushSeed + 101);
			const softenedFalloff = mix(0.34, 1, falloff);
			const densityThreshold = clamp01(
				settings.density * mix(0.82, 1.28, clusterNoise) * softenedFalloff +
					clusterNoise * 0.1 * falloff
			);

			if (placementNoise > densityThreshold) {
				continue;
			}

			const height = pickGrassHeight(
				settings.heightVariance,
				hash01(gridX, columnSurfaceGridY, gridZ, brushSeed + 203)
			);

			if (!canPlaceGrassColumn(world, player, columnAnchor, height)) {
				continue;
			}

			for (let step = 0; step < height; step += 1) {
				const origin = {
					x,
					y: columnAnchor.surfaceY + 1 + step * NATURE_BASE_VOXEL_SIZE,
					z
				};
				const materialId = pickMaterialId(
					grassMaterialIds,
					hash01(gridX, columnSurfaceGridY + step, gridZ, brushSeed + 307 + step * 11)
				);
				const block = world.placeBlock(origin, NATURE_BASE_VOXEL_SIZE, materialId);

				if (block) {
					recordChangedBlock(world, block, result);
				}
			}
		}
	}

	return result;
}

export function buildNatureTreePreview(
	world: VoxelWorld,
	player: PlayerController,
	hit: VoxelHit | null,
	settings: NatureTreeSettings
): NatureTreePreview {
	const placement = buildTreePlacement(world, player, hit, settings);

	return {
		anchor: placement.anchor,
		blocks: placement.blocks,
		valid: placement.valid,
		signature: placement.signature,
		bounds: placement.bounds
	};
}

export function placeNatureTree(
	world: VoxelWorld,
	player: PlayerController,
	hit: VoxelHit | null,
	settings: NatureTreeSettings
): VoxelCommandResult {
	const placement = buildTreePlacement(world, player, hit, settings);
	const result = createVoxelCommandResult();

	if (!placement.valid) {
		return result;
	}

	for (const blockId of placement.removableBlockIds) {
		const removedBlock = world.removeBlockById(blockId);

		if (removedBlock) {
			recordChangedBlock(world, removedBlock, result);
		}
	}

	for (const block of placement.blocks) {
		const placedBlock = world.placeBlock(block.origin, block.size, block.materialId);

		if (!placedBlock) {
			return result;
		}

		recordChangedBlock(world, placedBlock, result);
	}

	return result;
}

export function paintNatureFlowers(
	world: VoxelWorld,
	player: PlayerController,
	hit: VoxelHit | null,
	settings: NatureFlowerSettings
): VoxelCommandResult {
	const anchor = resolveNatureGroundAnchor(world, hit);
	const { flowerStemIds, flowerBloomPaletteIds } = getNatureMaterialSet();
	const result = createVoxelCommandResult();

	if (
		!anchor ||
		flowerStemIds.length === 0 ||
		Object.values(flowerBloomPaletteIds).every((palette) => palette.length === 0)
	) {
		return result;
	}

	const radius = settings.radius;
	const radiusSq = (radius + 0.45) ** 2;
	const anchorGridX = getNatureGridValue(anchor.x);
	const anchorGridZ = getNatureGridValue(anchor.z);
	const brushSeed = settings.seedOffset * 29 + getNatureGridValue(anchor.surfaceY) * 17;
	const clearedBlockIds = new Set<number>();
	const removableBlockIds = new Set<number>();
	const plannedBlocks = new Map<string, GeneratedNatureVoxel>();

	clearNatureFlowerFootprint(world, anchor, radius, result, clearedBlockIds);

	for (let dz = -radius; dz <= radius; dz += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const distanceSq = dx * dx + dz * dz;

			if (distanceSq > radiusSq) {
				continue;
			}

			const x = anchor.x + natureUnitsToWorld(dx);
			const z = anchor.z + natureUnitsToWorld(dz);
			const gridX = anchorGridX + dx;
			const gridZ = anchorGridZ + dz;
			const columnAnchor = findGroundAnchorForColumn(world, x, z, anchor.surfaceY);

			if (!columnAnchor) {
				continue;
			}

			const falloff = Math.max(0, 1 - Math.sqrt(distanceSq) / (radius + 0.45));
			const softenedFalloff = mix(0.24, 1, falloff);
			const columnSurfaceGridY = getNatureGridValue(columnAnchor.surfaceY);
			const clusterNoise = hash01(Math.floor(gridX * 0.7), 0, Math.floor(gridZ * 0.7), brushSeed);
			const placementNoise = hash01(gridX, columnSurfaceGridY, gridZ, brushSeed + 101);
			const densityThreshold = clamp01(
				settings.density * mix(0.48, 1.2, clusterNoise) * softenedFalloff
			);

			if (placementNoise > densityThreshold) {
				continue;
			}

			const flowerBlocks = buildFlowerPlant({
				anchor: columnAnchor,
				stemMaterialIds: flowerStemIds,
				bloomMaterialIds: resolveFlowerBloomMaterialIds(
					settings.blossomColor,
					flowerBloomPaletteIds,
					hashInt(gridX, columnSurfaceGridY, gridZ, brushSeed + 173)
				),
				seed: hashInt(gridX, columnSurfaceGridY, gridZ, brushSeed + 211)
			});

			if (
				flowerBlocks.length === 0 ||
				!canQueueFlowerPlant(world, player, plannedBlocks, removableBlockIds, flowerBlocks)
			) {
				continue;
			}

			for (const block of flowerBlocks) {
				plannedBlocks.set(worldCoordKey(block.origin), block);
			}
		}
	}

	for (const blockId of removableBlockIds) {
		const removedBlock = world.removeBlockById(blockId);

		if (removedBlock) {
			recordChangedBlock(world, removedBlock, result);
		}
	}

	for (const block of plannedBlocks.values()) {
		const placedBlock = world.placeBlock(block.origin, block.size, block.materialId);

		if (placedBlock) {
			recordChangedBlock(world, placedBlock, result);
		}
	}

	return result;
}

function buildTreePlacement(
	world: VoxelWorld,
	player: PlayerController,
	hit: VoxelHit | null,
	settings: NatureTreeSettings
): {
	anchor: NatureGroundAnchor | null;
	blocks: GeneratedNatureVoxel[];
	valid: boolean;
	removableBlockIds: Set<number>;
	signature: string | null;
	bounds: WorldBox | null;
} {
	const anchor = resolveNatureGroundAnchor(world, hit);
	const leafMaterialIds = getNatureMaterialIds('leaf');
	const barkMaterialIds = getNatureMaterialIds('bark');

	if (!anchor || leafMaterialIds.length === 0 || barkMaterialIds.length === 0) {
		return {
			anchor,
			blocks: [],
			valid: false,
			removableBlockIds: new Set<number>(),
			signature: null,
			bounds: null
		};
	}

	const seed = hashInt(
		getNatureGridValue(anchor.x),
		getNatureGridValue(anchor.surfaceY),
		getNatureGridValue(anchor.z),
		settings.seedOffset + 41
	);
	const trunkHeight = pickTreeHeight(settings, seed);
	const crownRadius = pickCrownRadius(settings, seed);
	const branchCount = pickBranchCount(settings, seed);
	const baseY = anchor.surfaceY + 1;
	const trunkX = anchor.x;
	const trunkZ = anchor.z;
	const woodBlocks = new Map<string, GeneratedNatureVoxel>();
	const leafBlocks = new Map<string, GeneratedNatureVoxel>();
	const branchTips: WorldCoord[] = [];

	buildTreeTrunk({
		woodBlocks,
		barkMaterialIds,
		trunkX,
		trunkZ,
		baseY,
		trunkHeight,
		seed
	});
	buildTreeBranches({
		woodBlocks,
		branchTips,
		barkMaterialIds,
		settings,
		trunkX,
		trunkZ,
		baseY,
		trunkHeight,
		branchCount,
		seed
	});
	addLeafCluster({
		woodBlocks,
		leafBlocks,
		leafMaterialIds,
		center: {
			x: trunkX,
			y: baseY + natureUnitsToWorld(trunkHeight + Math.max(1, Math.floor(crownRadius * 0.4))),
			z: trunkZ
		},
		radius: crownRadius,
		seed: seed + 701
	});

	for (let index = 0; index < branchTips.length; index += 1) {
		const branchTip = branchTips[index];
		const radius = Math.max(3, Math.round(crownRadius * 0.72) - (index % 2));

		addLeafCluster({
			woodBlocks,
			leafBlocks,
			leafMaterialIds,
			center: { x: branchTip.x, y: branchTip.y + NATURE_BASE_VOXEL_SIZE, z: branchTip.z },
			radius,
			seed: seed + 911 + index * 53
		});
	}

	const blocks = [...woodBlocks.values(), ...leafBlocks.values()];
	const removableBlockIds = new Set<number>();
	let valid = blocks.length > 0;

	for (const block of blocks) {
		if (!player.canPlaceBlockAt(block.origin, block.size)) {
			valid = false;
			break;
		}

		const overlappingBlocks = world.getOverlappingBlocks(block.origin, block.size);

		if (overlappingBlocks.length === 0) {
			continue;
		}

		for (const existingBlock of overlappingBlocks) {
			if (isWaterVoxelMaterial(existingBlock.materialId)) {
				valid = false;
				break;
			}

			if (
				isNatureGrassMaterial(existingBlock.materialId) ||
				isNatureLeafMaterial(existingBlock.materialId) ||
				isNatureFlowerMaterial(existingBlock.materialId)
			) {
				removableBlockIds.add(existingBlock.id);
				continue;
			}

			valid = false;
			break;
		}

		if (!valid) {
			break;
		}
	}

	return {
		anchor,
		blocks,
		valid,
		removableBlockIds,
		signature: anchor
			? `${anchor.x},${anchor.surfaceY},${anchor.z}:${settings.size}:${settings.seedOffset}`
			: null,
		bounds: blocks.length > 0 ? computeBounds(blocks) : null
	};
}

function buildTreeTrunk(input: {
	woodBlocks: Map<string, GeneratedNatureVoxel>;
	barkMaterialIds: number[];
	trunkX: number;
	trunkZ: number;
	baseY: number;
	trunkHeight: number;
	seed: number;
}): void {
	const { woodBlocks, barkMaterialIds, trunkX, trunkZ, baseY, trunkHeight, seed } = input;
	const trunkGridX = getNatureGridValue(trunkX);
	const trunkGridZ = getNatureGridValue(trunkZ);
	const lowerLayerCount = Math.max(5, Math.floor(trunkHeight * 0.3));
	const middleLayerCount = Math.max(lowerLayerCount + 4, Math.floor(trunkHeight * 0.72));
	const lowerFootprint: Array<[number, number]> = [
		[-1, -1],
		[0, -1],
		[1, -1],
		[-1, 0],
		[0, 0],
		[1, 0],
		[-1, 1],
		[0, 1],
		[1, 1]
	];
	const middleFootprint: Array<[number, number]> = [
		[0, 0],
		[-1, 0],
		[1, 0],
		[0, -1],
		[0, 1]
	];

	for (let layer = 0; layer < trunkHeight; layer += 1) {
		const y = baseY + natureUnitsToWorld(layer);
		const layerNoise = hash01(trunkGridX, layer, trunkGridZ, seed + 131);

		if (layer < lowerLayerCount) {
			let retainedCells = 0;

			for (let index = 0; index < lowerFootprint.length; index += 1) {
				const footprintCell = lowerFootprint[index];

				if (!footprintCell) {
					continue;
				}

				const [offsetX, offsetZ] = footprintCell;
				const isCorner = Math.abs(offsetX) === 1 && Math.abs(offsetZ) === 1;
				const omitCorner =
					isCorner &&
					layer > 1 &&
					layer > lowerLayerCount * 0.38 &&
					hash01(trunkGridX + offsetX, layer, trunkGridZ + offsetZ, seed + 181 + index * 19) < 0.16;

				if (omitCorner && retainedCells >= 5) {
					continue;
				}

				retainedCells += 1;
				setGeneratedBlock(
					woodBlocks,
					{
						x: trunkX + natureUnitsToWorld(offsetX),
						y,
						z: trunkZ + natureUnitsToWorld(offsetZ)
					},
					pickMaterialId(
						barkMaterialIds,
						hash01(trunkGridX + offsetX, layer, trunkGridZ + offsetZ, seed + 229)
					)
				);
			}
		} else if (layer < middleLayerCount) {
			let retainedCells = 0;

			for (let index = 0; index < middleFootprint.length; index += 1) {
				const footprintCell = middleFootprint[index];

				if (!footprintCell) {
					continue;
				}

				const [offsetX, offsetZ] = footprintCell;
				const omitArm =
					index > 0 &&
					layer > middleLayerCount * 0.55 &&
					hash01(trunkGridX + offsetX, layer, trunkGridZ + offsetZ, seed + 247 + index * 13) < 0.12;

				if (omitArm && retainedCells >= 3) {
					continue;
				}

				retainedCells += 1;
				setGeneratedBlock(
					woodBlocks,
					{
						x: trunkX + natureUnitsToWorld(offsetX),
						y,
						z: trunkZ + natureUnitsToWorld(offsetZ)
					},
					pickMaterialId(
						barkMaterialIds,
						hash01(trunkGridX + offsetX, layer, trunkGridZ + offsetZ, seed + 263)
					)
				);
			}
		} else {
			setGeneratedBlock(
				woodBlocks,
				{ x: trunkX, y, z: trunkZ },
				pickMaterialId(barkMaterialIds, hash01(trunkGridX, layer, trunkGridZ, seed + 277))
			);
		}

		if (layer === 0 || layer > trunkHeight - 2) {
			continue;
		}

		if (layerNoise < 0.22) {
			const direction = pickCardinalDirection(hashInt(trunkGridX, layer, trunkGridZ, seed + 313));
			setGeneratedBlock(
				woodBlocks,
				{
					x: trunkX + natureUnitsToWorld(direction.x),
					y,
					z: trunkZ + natureUnitsToWorld(direction.z)
				},
				pickMaterialId(
					barkMaterialIds,
					hash01(trunkGridX + direction.x, layer, trunkGridZ + direction.z, seed + 347)
				)
			);
		}
	}
}

function buildTreeBranches(input: {
	woodBlocks: Map<string, GeneratedNatureVoxel>;
	branchTips: WorldCoord[];
	barkMaterialIds: number[];
	settings: NatureTreeSettings;
	trunkX: number;
	trunkZ: number;
	baseY: number;
	trunkHeight: number;
	branchCount: number;
	seed: number;
}): void {
	const {
		woodBlocks,
		branchTips,
		barkMaterialIds,
		settings,
		trunkX,
		trunkZ,
		baseY,
		trunkHeight,
		branchCount,
		seed
	} = input;
	const startLayer = Math.max(4, Math.floor(trunkHeight * 0.58));
	const layerRange = Math.max(2, trunkHeight - startLayer - 1);
	const trunkGridX = getNatureGridValue(trunkX);

	for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
		const direction = pickCardinalDirection(seed + 401 + branchIndex * 23);
		let x = trunkX;
		let y =
			baseY +
			natureUnitsToWorld(
				startLayer +
					Math.floor(hash01(branchIndex, trunkHeight, trunkGridX, seed + 433) * layerRange)
			);
		let z = trunkZ;
		const branchLength = pickBranchLength(settings, seed + 467 + branchIndex * 29);

		for (let step = 0; step < branchLength; step += 1) {
			x += natureUnitsToWorld(direction.x);
			z += natureUnitsToWorld(direction.z);
			const gridX = getNatureGridValue(x);
			const gridY = getNatureGridValue(y);
			const gridZ = getNatureGridValue(z);

			if (step > 0 || hash01(gridX, gridY, gridZ, seed + 503 + step * 7) > 0.34) {
				y += NATURE_BASE_VOXEL_SIZE;
			}

			setGeneratedBlock(
				woodBlocks,
				{ x, y, z },
				pickMaterialId(
					barkMaterialIds,
					hash01(
						getNatureGridValue(x),
						getNatureGridValue(y),
						getNatureGridValue(z),
						seed + 541 + branchIndex * 11
					)
				)
			);

			if (
				step < branchLength - 1 &&
				hash01(
					getNatureGridValue(x),
					getNatureGridValue(y),
					getNatureGridValue(z),
					seed + 577 + step * 29
				) < 0.18
			) {
				setGeneratedBlock(
					woodBlocks,
					{ x, y: y + NATURE_BASE_VOXEL_SIZE, z },
					pickMaterialId(
						barkMaterialIds,
						hash01(
							getNatureGridValue(x),
							getNatureGridValue(y) + 1,
							getNatureGridValue(z),
							seed + 607
						)
					)
				);
			}
		}

		branchTips.push({ x, y, z });
	}
}

function addLeafCluster(input: {
	woodBlocks: Map<string, GeneratedNatureVoxel>;
	leafBlocks: Map<string, GeneratedNatureVoxel>;
	leafMaterialIds: number[];
	center: WorldCoord;
	radius: number;
	seed: number;
}): void {
	const { woodBlocks, leafBlocks, leafMaterialIds, center, radius, seed } = input;
	const candidates: Array<{ origin: WorldCoord; distance: number }> = [];
	const radiusY = radius * 0.82;

	for (let dz = -radius; dz <= radius; dz += 1) {
		for (let dy = -radius; dy <= radius + 1; dy += 1) {
			for (let dx = -radius; dx <= radius; dx += 1) {
				const x = center.x + natureUnitsToWorld(dx);
				const y = center.y + natureUnitsToWorld(dy);
				const z = center.z + natureUnitsToWorld(dz);
				const gridX = getNatureGridValue(x);
				const gridY = getNatureGridValue(y);
				const gridZ = getNatureGridValue(z);
				const normalizedDistance =
					(dx * dx) / (radius * radius) +
					(dy * dy) / Math.max(1, radiusY * radiusY) +
					(dz * dz) / (radius * radius);
				const shapeNoise = hash01(gridX, gridY, gridZ, seed + 641);
				const fillNoise = hash01(gridX, gridY, gridZ, seed + 683);
				const distanceThreshold = 1.02 + (shapeNoise - 0.5) * 0.3;
				const fillThreshold = 0.28 + Math.max(0, 1 - normalizedDistance) * 0.52;

				if (normalizedDistance > distanceThreshold || fillNoise > fillThreshold) {
					continue;
				}

				candidates.push({
					origin: { x, y, z },
					distance: normalizedDistance
				});
			}
		}
	}

	candidates.sort((a, b) => a.distance - b.distance);

	for (const candidate of candidates) {
		const candidateKey = worldCoordKey(candidate.origin);

		if (woodBlocks.has(candidateKey) || leafBlocks.has(candidateKey)) {
			continue;
		}

		if (!hasOrthogonalSupport(candidate.origin, woodBlocks, leafBlocks)) {
			continue;
		}

		setGeneratedBlock(
			leafBlocks,
			candidate.origin,
			pickMaterialId(
				leafMaterialIds,
				hash01(
					getNatureGridValue(candidate.origin.x),
					getNatureGridValue(candidate.origin.y),
					getNatureGridValue(candidate.origin.z),
					seed + 727
				)
			)
		);
	}
}

function findGroundAnchorForColumn(
	world: VoxelWorld,
	x: number,
	z: number,
	referenceY: number
): NatureGroundAnchor | null {
	for (let y = referenceY + GROUND_SEARCH_UP; y >= referenceY - GROUND_SEARCH_DOWN; y -= 1) {
		const block = world.getBlockAt(x, y, z);

		if (!block || !isValidNatureGroundBlock(block)) {
			continue;
		}

		const surfaceY = block.origin.y + block.size - 1;
		const blockAbove = world.getBlockAt(x, surfaceY + 1, z);

		if (blockAbove && !isNatureMaterial(blockAbove.materialId)) {
			continue;
		}

		return { x, z, surfaceY };
	}

	return null;
}

function clearNatureGrassColumn(
	world: VoxelWorld,
	anchor: NatureGroundAnchor,
	result: VoxelCommandResult,
	affectedBlockIds: Set<number>
): void {
	for (let step = 1; step <= MAX_GRASS_CLEAR_HEIGHT; step += 1) {
		const grassBlock = world.getBlockAt(anchor.x, anchor.surfaceY + step, anchor.z);

		if (!grassBlock || !isNatureGrassMaterial(grassBlock.materialId)) {
			continue;
		}

		if (affectedBlockIds.has(grassBlock.id)) {
			continue;
		}

		affectedBlockIds.add(grassBlock.id);
		const removedBlock = world.removeBlockById(grassBlock.id);

		if (removedBlock) {
			recordChangedBlock(world, removedBlock, result);
		}
	}
}

function clearNatureFlowerFootprint(
	world: VoxelWorld,
	anchor: NatureGroundAnchor,
	radius: number,
	result: VoxelCommandResult,
	affectedBlockIds: Set<number>
): void {
	const clearRadiusSq = (radius + 1.15) ** 2;

	for (let dz = -radius - 1; dz <= radius + 1; dz += 1) {
		for (let dx = -radius - 1; dx <= radius + 1; dx += 1) {
			if (dx * dx + dz * dz > clearRadiusSq) {
				continue;
			}

			const columnAnchor = findGroundAnchorForColumn(
				world,
				anchor.x + natureUnitsToWorld(dx),
				anchor.z + natureUnitsToWorld(dz),
				anchor.surfaceY
			);

			if (!columnAnchor) {
				continue;
			}

			clearNatureFlowerColumn(world, columnAnchor, result, affectedBlockIds);
		}
	}
}

function clearNatureFlowerColumn(
	world: VoxelWorld,
	anchor: NatureGroundAnchor,
	result: VoxelCommandResult,
	affectedBlockIds: Set<number>
): void {
	for (let z = anchor.z - 1; z <= anchor.z + NATURE_BASE_VOXEL_SIZE; z += 1) {
		for (let y = anchor.surfaceY + 1; y <= anchor.surfaceY + MAX_FLOWER_CLEAR_HEIGHT; y += 1) {
			for (let x = anchor.x - 1; x <= anchor.x + NATURE_BASE_VOXEL_SIZE; x += 1) {
				const flowerBlock = world.getBlockAt(x, y, z);

				if (!flowerBlock || !isNatureFlowerMaterial(flowerBlock.materialId)) {
					continue;
				}

				if (affectedBlockIds.has(flowerBlock.id)) {
					continue;
				}

				affectedBlockIds.add(flowerBlock.id);
				const removedBlock = world.removeBlockById(flowerBlock.id);

				if (removedBlock) {
					recordChangedBlock(world, removedBlock, result);
				}
			}
		}
	}
}

function canPlaceGrassColumn(
	world: VoxelWorld,
	player: PlayerController,
	anchor: NatureGroundAnchor,
	height: number
): boolean {
	for (let step = 0; step < height; step += 1) {
		const origin = {
			x: anchor.x,
			y: anchor.surfaceY + 1 + step * NATURE_BASE_VOXEL_SIZE,
			z: anchor.z
		};
		const overlappingBlocks = world.getOverlappingBlocks(origin, NATURE_BASE_VOXEL_SIZE);

		if (
			overlappingBlocks.some((block) => !isNatureGrassMaterial(block.materialId)) ||
			!player.canPlaceBlockAt(origin, NATURE_BASE_VOXEL_SIZE)
		) {
			return false;
		}
	}

	return true;
}

function buildFlowerPlant(input: {
	anchor: NatureGroundAnchor;
	stemMaterialIds: number[];
	bloomMaterialIds: number[];
	seed: number;
}): GeneratedNatureVoxel[] {
	const { anchor, stemMaterialIds, bloomMaterialIds, seed } = input;
	const stemHeight = pickFlowerStemHeight(
		hash01(
			getNatureGridValue(anchor.x),
			getNatureGridValue(anchor.surfaceY),
			getNatureGridValue(anchor.z),
			seed + 17
		)
	);
	const stemBaseY = anchor.surfaceY + 1;
	const blossomBaseY = stemBaseY + stemHeight * NATURE_BASE_VOXEL_SIZE;
	const blocks = new Map<string, GeneratedNatureVoxel>();
	const stemShadeMaterialId = pickToneMaterialId(stemMaterialIds, 0);
	const stemMidMaterialId = pickToneMaterialId(stemMaterialIds, 1);
	const stemLightMaterialId = pickToneMaterialId(stemMaterialIds, 2);
	const bloomShadeMaterialId = pickToneMaterialId(bloomMaterialIds, 0);
	const bloomCoreMaterialId = pickToneMaterialId(bloomMaterialIds, 1);
	const bloomLightMaterialId = pickToneMaterialId(bloomMaterialIds, 2);

	for (let step = 0; step < stemHeight; step += 1) {
		const origin = {
			x: anchor.x,
			y: stemBaseY + step * NATURE_BASE_VOXEL_SIZE,
			z: anchor.z
		};
		const stemMaterialId =
			step === stemHeight - 1
				? stemLightMaterialId
				: step >= Math.max(1, Math.ceil(stemHeight * 0.6))
					? stemMidMaterialId
					: stemShadeMaterialId;
		setGeneratedBlock(blocks, origin, stemMaterialId, NATURE_BASE_VOXEL_SIZE);
	}

	for (const origin of getFlowerCoreOrigins(anchor, blossomBaseY)) {
		const isEdge = origin.x !== anchor.x || origin.z !== anchor.z;
		setGeneratedBlock(
			blocks,
			origin,
			isEdge ? bloomCoreMaterialId : bloomShadeMaterialId,
			NATURE_DETAIL_VOXEL_SIZE
		);
	}

	const petalDirections = rotateCardinalDirections(Math.abs(seed) % 4);
	const topPetalNoise = hash01(
		getNatureGridValue(anchor.x),
		getNatureGridValue(blossomBaseY),
		getNatureGridValue(anchor.z),
		seed + 59
	);
	const topPetalCount = topPetalNoise < 0.22 ? 2 : topPetalNoise < 0.68 ? 3 : 4;

	for (let index = 0; index < petalDirections.length; index += 1) {
		const direction = petalDirections[index];

		if (!direction) {
			continue;
		}

		for (const origin of getFlowerPetalOrigins(anchor, blossomBaseY, direction)) {
			setGeneratedBlock(
				blocks,
				origin,
				index < 2 ? bloomLightMaterialId : bloomCoreMaterialId,
				NATURE_DETAIL_VOXEL_SIZE
			);
		}
	}

	for (const origin of getFlowerDiagonalOrigins(anchor, blossomBaseY, seed)) {
		setGeneratedBlock(blocks, origin, bloomLightMaterialId, NATURE_DETAIL_VOXEL_SIZE);
	}

	for (const origin of getFlowerTopOrigins(anchor, blossomBaseY + 1, topPetalCount, seed)) {
		setGeneratedBlock(blocks, origin, bloomLightMaterialId, NATURE_DETAIL_VOXEL_SIZE);
	}

	return [...blocks.values()];
}

function getFlowerCoreOrigins(anchor: NatureGroundAnchor, blossomY: number): WorldCoord[] {
	return [
		{ x: anchor.x, y: blossomY, z: anchor.z },
		{ x: anchor.x + 1, y: blossomY, z: anchor.z },
		{ x: anchor.x, y: blossomY, z: anchor.z + 1 },
		{ x: anchor.x + 1, y: blossomY, z: anchor.z + 1 }
	];
}

function getFlowerPetalOrigins(
	anchor: NatureGroundAnchor,
	blossomY: number,
	direction: { x: number; z: number }
): WorldCoord[] {
	if (direction.x > 0) {
		return [
			{ x: anchor.x + 2, y: blossomY, z: anchor.z },
			{ x: anchor.x + 2, y: blossomY, z: anchor.z + 1 }
		];
	}

	if (direction.x < 0) {
		return [
			{ x: anchor.x - 1, y: blossomY, z: anchor.z },
			{ x: anchor.x - 1, y: blossomY, z: anchor.z + 1 }
		];
	}

	if (direction.z > 0) {
		return [
			{ x: anchor.x, y: blossomY, z: anchor.z + 2 },
			{ x: anchor.x + 1, y: blossomY, z: anchor.z + 2 }
		];
	}

	return [
		{ x: anchor.x, y: blossomY, z: anchor.z - 1 },
		{ x: anchor.x + 1, y: blossomY, z: anchor.z - 1 }
	];
}

function getFlowerDiagonalOrigins(
	anchor: NatureGroundAnchor,
	blossomY: number,
	seed: number
): WorldCoord[] {
	const origins: WorldCoord[] = [];
	const diagonalOffsets = [
		{ x: -1, z: -1 },
		{ x: 2, z: -1 },
		{ x: -1, z: 2 },
		{ x: 2, z: 2 }
	];

	for (let index = 0; index < diagonalOffsets.length; index += 1) {
		const offset = diagonalOffsets[(index + Math.abs(seed)) % diagonalOffsets.length];

		if (
			!offset ||
			hash01(
				getNatureGridValue(anchor.x + offset.x),
				getNatureGridValue(blossomY),
				getNatureGridValue(anchor.z + offset.z),
				seed + 71 + index * 13
			) < 0.36
		) {
			continue;
		}

		origins.push({
			x: anchor.x + offset.x,
			y: blossomY,
			z: anchor.z + offset.z
		});
	}

	return origins;
}

function getFlowerTopOrigins(
	anchor: NatureGroundAnchor,
	blossomY: number,
	count: number,
	seed: number
): WorldCoord[] {
	const topOrigins = [
		{ x: anchor.x, y: blossomY, z: anchor.z },
		{ x: anchor.x + 1, y: blossomY, z: anchor.z },
		{ x: anchor.x, y: blossomY, z: anchor.z + 1 },
		{ x: anchor.x + 1, y: blossomY, z: anchor.z + 1 }
	];
	const offset = Math.abs(seed) % topOrigins.length;
	const origins: WorldCoord[] = [];

	for (let index = 0; index < count; index += 1) {
		const origin = topOrigins[(index + offset) % topOrigins.length];

		if (origin) {
			origins.push(origin);
		}
	}

	return origins;
}

function resolveFlowerBloomMaterialIds(
	blossomColor: NatureFlowerColorMode,
	flowerBloomPaletteIds: Record<Exclude<NatureFlowerColorMode, 'random'>, number[]>,
	seed: number
): number[] {
	if (blossomColor !== 'random') {
		return [...(flowerBloomPaletteIds[blossomColor] ?? [])];
	}

	const colorOrder: Array<Exclude<NatureFlowerColorMode, 'random'>> = [
		'scarlet',
		'cobalt',
		'amber',
		'violet'
	];
	const selectedColor = colorOrder[Math.abs(seed) % colorOrder.length] ?? colorOrder[0];

	return [...(selectedColor ? (flowerBloomPaletteIds[selectedColor] ?? []) : [])];
}

function canQueueFlowerPlant(
	world: VoxelWorld,
	player: PlayerController,
	plannedBlocks: ReadonlyMap<string, GeneratedNatureVoxel>,
	removableBlockIds: Set<number>,
	flowerBlocks: ReadonlyArray<GeneratedNatureVoxel>
): boolean {
	for (const block of flowerBlocks) {
		const key = worldCoordKey(block.origin);

		if (plannedBlocks.has(key) || !player.canPlaceBlockAt(block.origin, block.size)) {
			return false;
		}

		const existingBlocks = world.getOverlappingBlocks(block.origin, block.size);

		if (existingBlocks.length === 0) {
			continue;
		}

		for (const existingBlock of existingBlocks) {
			if (
				!isNatureGrassMaterial(existingBlock.materialId) &&
				!isNatureFlowerMaterial(existingBlock.materialId)
			) {
				return false;
			}

			removableBlockIds.add(existingBlock.id);
		}
	}

	return true;
}

function pickFlowerStemHeight(noise: number): number {
	return chooseWeightedHeight(noise, [
		[FLOWER_MIN_STEM_HEIGHT, 0.24],
		[FLOWER_MIN_STEM_HEIGHT + 1, 0.56],
		[FLOWER_MAX_STEM_HEIGHT, 0.2]
	]);
}

function isValidNatureGroundBlock(block: Pick<VoxelBlock, 'materialId'>): boolean {
	return !isWaterVoxelMaterial(block.materialId) && !isNatureMaterial(block.materialId);
}

function pickGrassHeight(heightVariance: NatureGrassHeightVariance, noise: number): number {
	switch (heightVariance) {
		case 'low':
			return chooseWeightedHeight(noise, [
				[1, 0.7],
				[2, 0.25],
				[3, 0.05]
			]);
		case 'high':
			return chooseWeightedHeight(noise, [
				[1, 0.18],
				[2, 0.28],
				[3, 0.34],
				[4, 0.2]
			]);
		default:
			return chooseWeightedHeight(noise, [
				[1, 0.34],
				[2, 0.33],
				[3, 0.23],
				[4, 0.1]
			]);
	}
}

function chooseWeightedHeight(
	noise: number,
	weights: Array<[height: number, weight: number]>
): number {
	let threshold = 0;

	for (const [height, weight] of weights) {
		threshold += weight;

		if (noise <= threshold) {
			return height;
		}
	}

	return weights[weights.length - 1]?.[0] ?? 1;
}

function pickTreeHeight(settings: NatureTreeSettings, seed: number): number {
	const noise = hash01(seed, 0, 0, 97);

	switch (settings.size) {
		case 'small':
			return scaleTreeMeasure(9 + Math.floor(noise * 3));
		case 'large':
			return scaleTreeMeasure(16 + Math.floor(noise * 5));
		default:
			return scaleTreeMeasure(12 + Math.floor(noise * 4));
	}
}

function pickCrownRadius(settings: NatureTreeSettings, seed: number): number {
	const noise = hash01(seed, 0, 0, 137);

	switch (settings.size) {
		case 'small':
			return scaleTreeMeasure(3 + Math.floor(noise * 2));
		case 'large':
			return scaleTreeMeasure(5 + Math.floor(noise * 2));
		default:
			return scaleTreeMeasure(4 + Math.floor(noise * 2));
	}
}

function pickBranchCount(settings: NatureTreeSettings, seed: number): number {
	const noise = hash01(seed, 0, 0, 173);

	switch (settings.size) {
		case 'small':
			return 5 + Math.floor(noise * 3);
		case 'large':
			return 9 + Math.floor(noise * 4);
		default:
			return 7 + Math.floor(noise * 3);
	}
}

function pickBranchLength(settings: NatureTreeSettings, seed: number): number {
	const noise = hash01(seed, 0, 0, 211);

	switch (settings.size) {
		case 'small':
			return 5 + Math.floor(noise * 3);
		case 'large':
			return 9 + Math.floor(noise * 5);
		default:
			return 7 + Math.floor(noise * 4);
	}
}

function scaleTreeMeasure(baseValue: number): number {
	return Math.max(1, Math.round(baseValue * TREE_SCALE));
}

function computeBounds(blocks: ReadonlyArray<GeneratedNatureVoxel>): WorldBox {
	const min = { ...blocks[0]!.origin };
	const max = {
		x: blocks[0]!.origin.x + blocks[0]!.size - 1,
		y: blocks[0]!.origin.y + blocks[0]!.size - 1,
		z: blocks[0]!.origin.z + blocks[0]!.size - 1
	};

	for (const block of blocks) {
		min.x = Math.min(min.x, block.origin.x);
		min.y = Math.min(min.y, block.origin.y);
		min.z = Math.min(min.z, block.origin.z);
		max.x = Math.max(max.x, block.origin.x + block.size - 1);
		max.y = Math.max(max.y, block.origin.y + block.size - 1);
		max.z = Math.max(max.z, block.origin.z + block.size - 1);
	}

	return { min, max };
}

function hasOrthogonalSupport(
	origin: WorldCoord,
	woodBlocks: ReadonlyMap<string, GeneratedNatureVoxel>,
	leafBlocks: ReadonlyMap<string, GeneratedNatureVoxel>
): boolean {
	for (const offset of CARDINAL_DIRECTIONS_3D) {
		const neighborKey = worldCoordKey({
			x: origin.x + offset.x * NATURE_BASE_VOXEL_SIZE,
			y: origin.y + offset.y * NATURE_BASE_VOXEL_SIZE,
			z: origin.z + offset.z * NATURE_BASE_VOXEL_SIZE
		});

		if (woodBlocks.has(neighborKey) || leafBlocks.has(neighborKey)) {
			return true;
		}
	}

	return false;
}

function recordChangedBlock(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'origin' | 'size'>,
	result: VoxelCommandResult
): void {
	world.collectAffectedChunkKeysForBlock(block.origin, block.size, result.affectedChunkKeys);
	result.changedVoxelCount += block.size ** 3;
}

function setGeneratedBlock(
	blocks: Map<string, GeneratedNatureVoxel>,
	origin: WorldCoord,
	materialId: number,
	size = NATURE_BASE_VOXEL_SIZE
): void {
	blocks.set(worldCoordKey(origin), {
		origin: { ...origin },
		materialId,
		size
	});
}

function pickMaterialId(materialIds: number[], noise: number): number {
	const safeIndex = Math.min(materialIds.length - 1, Math.floor(noise * materialIds.length));
	return materialIds[safeIndex] ?? materialIds[0] ?? 0;
}

function pickToneMaterialId(materialIds: ReadonlyArray<number>, toneIndex: number): number {
	const safeIndex = Math.max(0, Math.min(materialIds.length - 1, toneIndex));
	return materialIds[safeIndex] ?? materialIds[0] ?? 0;
}

function pickCardinalDirection(seed: number): { x: number; z: number } {
	const directions = [
		{ x: 1, z: 0 },
		{ x: -1, z: 0 },
		{ x: 0, z: 1 },
		{ x: 0, z: -1 }
	];
	return directions[Math.abs(seed) % directions.length] ?? directions[0]!;
}

function rotateCardinalDirections(offset: number): Array<{ x: number; z: number }> {
	const directions = [
		{ x: 1, z: 0 },
		{ x: 0, z: 1 },
		{ x: -1, z: 0 },
		{ x: 0, z: -1 }
	];

	return directions.map(
		(_, index) => directions[(index + offset) % directions.length] ?? directions[0]!
	);
}

function worldCoordKey(origin: WorldCoord): string {
	return `${origin.x},${origin.y},${origin.z}`;
}

function hash01(x: number, y: number, z: number, seed: number): number {
	return (hashInt(x, y, z, seed) >>> 0) / 4294967295;
}

function hashInt(x: number, y: number, z: number, seed: number): number {
	let value = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ seed;
	value ^= value >>> 13;
	value = Math.imul(value, 1274126177);
	value ^= value >>> 16;
	return value | 0;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

const CARDINAL_DIRECTIONS_3D = [
	new THREE.Vector3(1, 0, 0),
	new THREE.Vector3(-1, 0, 0),
	new THREE.Vector3(0, 0, 1),
	new THREE.Vector3(0, 0, -1),
	new THREE.Vector3(0, 1, 0),
	new THREE.Vector3(0, -1, 0)
];
