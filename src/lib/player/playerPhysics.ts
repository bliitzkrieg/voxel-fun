import * as THREE from 'three';

import { DEFAULT_VOXEL_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import type { VoxelWorld } from '$lib/voxel/world';

export interface PlayerCollider {
	halfWidth: number;
	height: number;
}

export interface PlayerPhysicsResult {
	position: THREE.Vector3;
	velocity: THREE.Vector3;
	onGround: boolean;
}

const COLLISION_EPSILON = 1e-5;
const MAX_STEP_HEIGHT = 1.05 * DEFAULT_VOXEL_SIZE;

export function getPlayerBounds(
	position: THREE.Vector3,
	collider: PlayerCollider,
	min: THREE.Vector3,
	max: THREE.Vector3
): void {
	min.set(position.x - collider.halfWidth, position.y, position.z - collider.halfWidth);
	max.set(
		position.x + collider.halfWidth,
		position.y + collider.height,
		position.z + collider.halfWidth
	);
}

export function intersectsSolid(
	world: VoxelWorld,
	min: THREE.Vector3,
	max: THREE.Vector3
): boolean {
	const minVoxelX = Math.floor(min.x);
	const minVoxelY = Math.floor(min.y);
	const minVoxelZ = Math.floor(min.z);
	const maxVoxelX = Math.floor(max.x - COLLISION_EPSILON);
	const maxVoxelY = Math.floor(max.y - COLLISION_EPSILON);
	const maxVoxelZ = Math.floor(max.z - COLLISION_EPSILON);

	for (let vz = minVoxelZ; vz <= maxVoxelZ; vz += 1) {
		for (let vy = minVoxelY; vy <= maxVoxelY; vy += 1) {
			for (let vx = minVoxelX; vx <= maxVoxelX; vx += 1) {
				if (world.getVoxel(vx, vy, vz) !== VOXEL_AIR) {
					return true;
				}
			}
		}
	}

	return false;
}

export function resolvePlayerMovement(
	world: VoxelWorld,
	position: THREE.Vector3,
	velocity: THREE.Vector3,
	collider: PlayerCollider,
	dt: number
): PlayerPhysicsResult {
	const nextPosition = position.clone();
	const nextVelocity = velocity.clone();
	let onGround = false;

	nextPosition.x += nextVelocity.x * dt;
	if (resolveAxisCollision(world, nextPosition, nextVelocity, collider, 'x')) {
		nextVelocity.x = 0;
	}

	nextPosition.y += nextVelocity.y * dt;
	if (resolveAxisCollision(world, nextPosition, nextVelocity, collider, 'y')) {
		if (nextVelocity.y < 0) {
			onGround = true;
		}

		nextVelocity.y = 0;
	}

	nextPosition.z += nextVelocity.z * dt;
	if (resolveAxisCollision(world, nextPosition, nextVelocity, collider, 'z')) {
		nextVelocity.z = 0;
	}

	return {
		position: nextPosition,
		velocity: nextVelocity,
		onGround
	};
}

type Axis = 'x' | 'y' | 'z';

function resolveAxisCollision(
	world: VoxelWorld,
	position: THREE.Vector3,
	velocity: THREE.Vector3,
	collider: PlayerCollider,
	axis: Axis
): boolean {
	const axisVelocity = velocity[axis];

	if (axisVelocity === 0) {
		return false;
	}

	const min = new THREE.Vector3();
	const max = new THREE.Vector3();
	getPlayerBounds(position, collider, min, max);
	const overlaps = getSolidOverlaps(world, min, max);

	if (overlaps.length === 0) {
		return false;
	}

	if ((axis === 'x' || axis === 'z') && velocity.y <= 0 && tryStepUp(world, position, collider)) {
		return false;
	}

	if (axis === 'x') {
		position.x =
			axisVelocity > 0
				? Math.min(...overlaps.map((voxel) => voxel.x - collider.halfWidth))
				: Math.max(...overlaps.map((voxel) => voxel.x + 1 + collider.halfWidth));
		return true;
	}

	if (axis === 'y') {
		position.y =
			axisVelocity > 0
				? Math.min(...overlaps.map((voxel) => voxel.y - collider.height))
				: Math.max(...overlaps.map((voxel) => voxel.y + 1));
		return true;
	}

	position.z =
		axisVelocity > 0
			? Math.min(...overlaps.map((voxel) => voxel.z - collider.halfWidth))
			: Math.max(...overlaps.map((voxel) => voxel.z + 1 + collider.halfWidth));
	return true;
}

function tryStepUp(world: VoxelWorld, position: THREE.Vector3, collider: PlayerCollider): boolean {
	const steppedPosition = position.clone();
	steppedPosition.y += MAX_STEP_HEIGHT;

	const min = new THREE.Vector3();
	const max = new THREE.Vector3();
	getPlayerBounds(steppedPosition, collider, min, max);

	if (intersectsSolid(world, min, max)) {
		return false;
	}

	position.copy(steppedPosition);
	return true;
}

function getSolidOverlaps(
	world: VoxelWorld,
	min: THREE.Vector3,
	max: THREE.Vector3
): Array<{ x: number; y: number; z: number }> {
	const overlaps: Array<{ x: number; y: number; z: number }> = [];
	const minVoxelX = Math.floor(min.x);
	const minVoxelY = Math.floor(min.y);
	const minVoxelZ = Math.floor(min.z);
	const maxVoxelX = Math.floor(max.x - COLLISION_EPSILON);
	const maxVoxelY = Math.floor(max.y - COLLISION_EPSILON);
	const maxVoxelZ = Math.floor(max.z - COLLISION_EPSILON);

	for (let vz = minVoxelZ; vz <= maxVoxelZ; vz += 1) {
		for (let vy = minVoxelY; vy <= maxVoxelY; vy += 1) {
			for (let vx = minVoxelX; vx <= maxVoxelX; vx += 1) {
				if (world.getVoxel(vx, vy, vz) !== VOXEL_AIR) {
					overlaps.push({ x: vx, y: vy, z: vz });
				}
			}
		}
	}

	return overlaps;
}
