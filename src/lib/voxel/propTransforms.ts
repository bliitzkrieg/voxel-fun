import * as THREE from 'three';

import { createWorldBox } from '$lib/voxel/voxelTypes';
import type {
	PropDefinition,
	PropDefinitionBlock,
	PropInstanceRotation,
	VoxelBlock,
	WorldBox,
	WorldCoord
} from '$lib/voxel/voxelTypes';

export function capturePropDefinitionBlocks(
	blocks: ReadonlyArray<Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>>
): PropDefinitionBlock[] {
	if (!blocks.length) {
		return [];
	}

	const bounds = computeBlocksBounds(blocks);

	return blocks
		.map((block) => ({
			materialId: block.materialId,
			origin: {
				x: block.origin.x - bounds.min.x,
				y: block.origin.y - bounds.min.y,
				z: block.origin.z - bounds.min.z
			},
			size: block.size
		}))
		.sort(comparePropBlocks);
}

export function computePropBlockBounds(
	blocks: ReadonlyArray<Pick<PropDefinitionBlock, 'origin' | 'size'>>
): WorldBox {
	return computeBlocksBounds(blocks);
}

export function resolvePropDefinitionBlocks(
	prop: Pick<PropDefinition, 'blocks'>,
	origin: WorldCoord,
	rotationQuarterTurns: PropInstanceRotation
): PropDefinitionBlock[] {
	const rotationMatrix = createQuarterTurnMatrix(rotationQuarterTurns);
	const worldOrigin = new THREE.Vector3(origin.x, origin.y, origin.z);

	return prop.blocks
		.map((block) => transformBlock(block, worldOrigin, rotationMatrix))
		.sort(comparePropBlocks);
}

export function normalizeQuarterTurns(
	rotationQuarterTurns: PropInstanceRotation
): PropInstanceRotation {
	return {
		x: normalizeQuarterTurn(rotationQuarterTurns.x),
		y: normalizeQuarterTurn(rotationQuarterTurns.y),
		z: normalizeQuarterTurn(rotationQuarterTurns.z)
	};
}

function transformBlock(
	block: PropDefinitionBlock,
	worldOrigin: THREE.Vector3,
	rotationMatrix: THREE.Matrix4
): PropDefinitionBlock {
	const size = block.size;
	const corners = [
		new THREE.Vector3(block.origin.x, block.origin.y, block.origin.z),
		new THREE.Vector3(block.origin.x + size, block.origin.y, block.origin.z),
		new THREE.Vector3(block.origin.x, block.origin.y + size, block.origin.z),
		new THREE.Vector3(block.origin.x, block.origin.y, block.origin.z + size),
		new THREE.Vector3(block.origin.x + size, block.origin.y + size, block.origin.z),
		new THREE.Vector3(block.origin.x + size, block.origin.y, block.origin.z + size),
		new THREE.Vector3(block.origin.x, block.origin.y + size, block.origin.z + size),
		new THREE.Vector3(block.origin.x + size, block.origin.y + size, block.origin.z + size)
	].map((corner) => corner.applyMatrix4(rotationMatrix).add(worldOrigin));

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;

	for (const corner of corners) {
		minX = Math.min(minX, Math.round(corner.x));
		minY = Math.min(minY, Math.round(corner.y));
		minZ = Math.min(minZ, Math.round(corner.z));
		maxX = Math.max(maxX, Math.round(corner.x));
		maxY = Math.max(maxY, Math.round(corner.y));
		maxZ = Math.max(maxZ, Math.round(corner.z));
	}

	return {
		materialId: block.materialId,
		origin: {
			x: minX,
			y: minY,
			z: minZ
		},
		size: maxX - minX
	};
}

function createQuarterTurnMatrix(rotationQuarterTurns: PropInstanceRotation): THREE.Matrix4 {
	const normalized = normalizeQuarterTurns(rotationQuarterTurns);
	const euler = new THREE.Euler(
		normalized.x * Math.PI * 0.5,
		normalized.y * Math.PI * 0.5,
		normalized.z * Math.PI * 0.5,
		'XYZ'
	);

	return new THREE.Matrix4().makeRotationFromEuler(euler);
}

function computeBlocksBounds(
	blocks: ReadonlyArray<Pick<PropDefinitionBlock, 'origin' | 'size'>>
): WorldBox {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;

	for (const block of blocks) {
		minX = Math.min(minX, block.origin.x);
		minY = Math.min(minY, block.origin.y);
		minZ = Math.min(minZ, block.origin.z);
		maxX = Math.max(maxX, block.origin.x + block.size - 1);
		maxY = Math.max(maxY, block.origin.y + block.size - 1);
		maxZ = Math.max(maxZ, block.origin.z + block.size - 1);
	}

	return createWorldBox({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
}

function comparePropBlocks(a: PropDefinitionBlock, b: PropDefinitionBlock): number {
	return (
		a.origin.z - b.origin.z ||
		a.origin.y - b.origin.y ||
		a.origin.x - b.origin.x ||
		a.size - b.size ||
		a.materialId - b.materialId
	);
}

function normalizeQuarterTurn(value: number): number {
	return ((value % 4) + 4) % 4;
}
