import * as THREE from 'three';

import { VOXEL_AIR } from '$lib/voxel/constants';
import type { VoxelWorld } from '$lib/voxel/world';

export interface VoxelHit {
	voxel: { x: number; y: number; z: number };
	normal: { x: number; y: number; z: number };
	position: THREE.Vector3;
	distance: number;
}

const MAX_DDA_STEPS = 512;

export function raycastVoxel(
	world: VoxelWorld,
	origin: THREE.Vector3,
	direction: THREE.Vector3,
	maxDistance: number
): VoxelHit | null {
	if (direction.lengthSq() === 0) {
		return null;
	}

	const rayDirection = direction.clone().normalize();
	let voxelX = Math.floor(origin.x);
	let voxelY = Math.floor(origin.y);
	let voxelZ = Math.floor(origin.z);

	const stepX = Math.sign(rayDirection.x);
	const stepY = Math.sign(rayDirection.y);
	const stepZ = Math.sign(rayDirection.z);

	const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.x);
	const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.y);
	const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / rayDirection.z);

	const nextBoundaryX = stepX > 0 ? voxelX + 1 : voxelX;
	const nextBoundaryY = stepY > 0 ? voxelY + 1 : voxelY;
	const nextBoundaryZ = stepZ > 0 ? voxelZ + 1 : voxelZ;

	let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryX - origin.x) / rayDirection.x;
	let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryY - origin.y) / rayDirection.y;
	let tMaxZ = stepZ === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryZ - origin.z) / rayDirection.z;
	let distance = 0;
	let hitNormal = { x: 0, y: 0, z: 0 };

	for (let step = 0; step < MAX_DDA_STEPS && distance <= maxDistance; step += 1) {
		if (world.getVoxel(voxelX, voxelY, voxelZ) !== VOXEL_AIR) {
			return {
				voxel: { x: voxelX, y: voxelY, z: voxelZ },
				normal: hitNormal,
				position: origin.clone().addScaledVector(rayDirection, distance),
				distance
			};
		}

		if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
			voxelX += stepX;
			distance = tMaxX;
			tMaxX += tDeltaX;
			hitNormal = { x: -stepX, y: 0, z: 0 };
			continue;
		}

		if (tMaxY <= tMaxZ) {
			voxelY += stepY;
			distance = tMaxY;
			tMaxY += tDeltaY;
			hitNormal = { x: 0, y: -stepY, z: 0 };
			continue;
		}

		voxelZ += stepZ;
		distance = tMaxZ;
		tMaxZ += tDeltaZ;
		hitNormal = { x: 0, y: 0, z: -stepZ };
	}

	return null;
}
