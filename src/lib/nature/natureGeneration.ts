import * as THREE from 'three';

import { createVoxelCommandResult, type VoxelCommandResult } from '$lib/voxel/voxelCommands';
import {
	getNatureMaterialIds,
	isNatureGrassMaterial,
	isNatureLeafMaterial,
	isNatureMaterial,
	isWaterVoxelMaterial
} from '$lib/voxel/voxelPalette';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelWorld } from '$lib/voxel/world';
import type { PlayerController } from '$lib/player/playerController';
import type { VoxelBlock, WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
import type {
	NatureGrassHeightVariance,
	NatureGrassSettings,
	NatureTreeSettings
} from '$lib/nature/natureTypes';

const MAX_GRASS_HEIGHT = 4;
const GROUND_SEARCH_UP = 4;
const GROUND_SEARCH_DOWN = 14;
const TREE_SCALE = 2.5;

export interface NatureGroundAnchor {
	x: number;
	z: number;
	surfaceY: number;
}

export interface GeneratedNatureVoxel {
	origin: WorldCoord;
	materialId: number;
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

	const columnX = hit.voxel.x;
	const columnZ = hit.voxel.z;

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
	const brushSeed = settings.seedOffset * 17 + anchor.surfaceY * 13;

	for (let dz = -radius; dz <= radius; dz += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const distanceSq = dx * dx + dz * dz;

			if (distanceSq > radiusSq) {
				continue;
			}

			const x = anchor.x + dx;
			const z = anchor.z + dz;
			const columnKey = `${x},${z}`;

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
			const clusterNoise = hash01(Math.floor(x * 0.5), 0, Math.floor(z * 0.5), brushSeed);
			const placementNoise = hash01(x, columnAnchor.surfaceY, z, brushSeed + 101);
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
				hash01(x, columnAnchor.surfaceY, z, brushSeed + 203)
			);

			if (!canPlaceGrassColumn(world, player, columnAnchor, height)) {
				continue;
			}

			for (let step = 0; step < height; step += 1) {
				const origin = {
					x,
					y: columnAnchor.surfaceY + 1 + step,
					z
				};
				const materialId = pickMaterialId(
					grassMaterialIds,
					hash01(x, origin.y, z, brushSeed + 307 + step * 11)
				);
				const block = world.placeBlock(origin, 1, materialId);

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
		const placedBlock = world.placeBlock(block.origin, 1, block.materialId);

		if (!placedBlock) {
			return result;
		}

		recordChangedBlock(world, placedBlock, result);
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

	const seed = hashInt(anchor.x, anchor.surfaceY, anchor.z, settings.seedOffset + 41);
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
			y: baseY + trunkHeight + Math.max(1, Math.floor(crownRadius * 0.4)),
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
			center: { x: branchTip.x, y: branchTip.y + 1, z: branchTip.z },
			radius,
			seed: seed + 911 + index * 53
		});
	}

	const blocks = [...woodBlocks.values(), ...leafBlocks.values()];
	const removableBlockIds = new Set<number>();
	let valid = blocks.length > 0;

	for (const block of blocks) {
		if (!player.canPlaceVoxelAt(block.origin.x, block.origin.y, block.origin.z)) {
			valid = false;
			break;
		}

		const existingBlock = world.getBlockAt(block.origin.x, block.origin.y, block.origin.z);

		if (!existingBlock) {
			continue;
		}

		if (isWaterVoxelMaterial(existingBlock.materialId)) {
			valid = false;
			break;
		}

		if (
			isNatureGrassMaterial(existingBlock.materialId) ||
			isNatureLeafMaterial(existingBlock.materialId)
		) {
			removableBlockIds.add(existingBlock.id);
			continue;
		}

		valid = false;
		break;
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
		const y = baseY + layer;
		const layerNoise = hash01(trunkX, y, trunkZ, seed + 131);

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
					hash01(trunkX + offsetX, y, trunkZ + offsetZ, seed + 181 + index * 19) < 0.16;

				if (omitCorner && retainedCells >= 5) {
					continue;
				}

				retainedCells += 1;
				setGeneratedBlock(
					woodBlocks,
					{
						x: trunkX + offsetX,
						y,
						z: trunkZ + offsetZ
					},
					pickMaterialId(barkMaterialIds, hash01(trunkX + offsetX, y, trunkZ + offsetZ, seed + 229))
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
					hash01(trunkX + offsetX, y, trunkZ + offsetZ, seed + 247 + index * 13) < 0.12;

				if (omitArm && retainedCells >= 3) {
					continue;
				}

				retainedCells += 1;
				setGeneratedBlock(
					woodBlocks,
					{
						x: trunkX + offsetX,
						y,
						z: trunkZ + offsetZ
					},
					pickMaterialId(barkMaterialIds, hash01(trunkX + offsetX, y, trunkZ + offsetZ, seed + 263))
				);
			}
		} else {
			setGeneratedBlock(
				woodBlocks,
				{ x: trunkX, y, z: trunkZ },
				pickMaterialId(barkMaterialIds, hash01(trunkX, y, trunkZ, seed + 277))
			);
		}

		if (layer === 0 || layer > trunkHeight - 2) {
			continue;
		}

		if (layerNoise < 0.22) {
			const direction = pickCardinalDirection(hashInt(trunkX, y, trunkZ, seed + 313));
			setGeneratedBlock(
				woodBlocks,
				{ x: trunkX + direction.x, y, z: trunkZ + direction.z },
				pickMaterialId(
					barkMaterialIds,
					hash01(trunkX + direction.x, y, trunkZ + direction.z, seed + 347)
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

	for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
		const direction = pickCardinalDirection(seed + 401 + branchIndex * 23);
		let x = trunkX;
		let y =
			baseY +
			startLayer +
			Math.floor(hash01(branchIndex, trunkHeight, trunkX, seed + 433) * layerRange);
		let z = trunkZ;
		const branchLength = pickBranchLength(settings, seed + 467 + branchIndex * 29);

		for (let step = 0; step < branchLength; step += 1) {
			x += direction.x;
			z += direction.z;

			if (step > 0 || hash01(x, y, z, seed + 503 + step * 7) > 0.34) {
				y += 1;
			}

			setGeneratedBlock(
				woodBlocks,
				{ x, y, z },
				pickMaterialId(barkMaterialIds, hash01(x, y, z, seed + 541 + branchIndex * 11))
			);

			if (step < branchLength - 1 && hash01(x, y, z, seed + 577 + step * 29) < 0.18) {
				setGeneratedBlock(
					woodBlocks,
					{ x, y: y + 1, z },
					pickMaterialId(barkMaterialIds, hash01(x, y + 1, z, seed + 607))
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
				const x = center.x + dx;
				const y = center.y + dy;
				const z = center.z + dz;
				const normalizedDistance =
					(dx * dx) / (radius * radius) +
					(dy * dy) / Math.max(1, radiusY * radiusY) +
					(dz * dz) / (radius * radius);
				const shapeNoise = hash01(x, y, z, seed + 641);
				const fillNoise = hash01(x, y, z, seed + 683);
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
				hash01(candidate.origin.x, candidate.origin.y, candidate.origin.z, seed + 727)
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
	for (let step = 1; step <= MAX_GRASS_HEIGHT + 1; step += 1) {
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

function canPlaceGrassColumn(
	world: VoxelWorld,
	player: PlayerController,
	anchor: NatureGroundAnchor,
	height: number
): boolean {
	for (let step = 0; step < height; step += 1) {
		const x = anchor.x;
		const y = anchor.surfaceY + 1 + step;
		const z = anchor.z;
		const existingBlock = world.getBlockAt(x, y, z);

		if (existingBlock && !isNatureGrassMaterial(existingBlock.materialId)) {
			return false;
		}

		if (!player.canPlaceVoxelAt(x, y, z)) {
			return false;
		}
	}

	return true;
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
	const max = { ...blocks[0]!.origin };

	for (const block of blocks) {
		min.x = Math.min(min.x, block.origin.x);
		min.y = Math.min(min.y, block.origin.y);
		min.z = Math.min(min.z, block.origin.z);
		max.x = Math.max(max.x, block.origin.x);
		max.y = Math.max(max.y, block.origin.y);
		max.z = Math.max(max.z, block.origin.z);
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
			x: origin.x + offset.x,
			y: origin.y + offset.y,
			z: origin.z + offset.z
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
	materialId: number
): void {
	blocks.set(worldCoordKey(origin), {
		origin: { ...origin },
		materialId
	});
}

function pickMaterialId(materialIds: number[], noise: number): number {
	const safeIndex = Math.min(materialIds.length - 1, Math.floor(noise * materialIds.length));
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
