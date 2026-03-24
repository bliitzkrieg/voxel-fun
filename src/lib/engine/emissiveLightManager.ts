import * as THREE from 'three';

import { VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import { doesVoxelEmitLight, getVoxelLightTint } from '$lib/voxel/voxelPalette';
import type { VoxelWorld } from '$lib/voxel/world';

const MAX_ACTIVE_EMISSIVE_LIGHTS = 16;
const EMISSIVE_LIGHT_INTENSITY = 1.35;
const EMISSIVE_LIGHT_DISTANCE_BASE = 8 * VOXEL_WORLD_SIZE;
const CAMERA_RESYNC_DISTANCE_SQ = (VOXEL_WORLD_SIZE * 3) ** 2;

interface EmissiveLightCandidate {
	blockId: number;
	position: THREE.Vector3;
	color: THREE.Color;
	distance: number;
}

export class EmissiveLightManager {
	private readonly lightPool: THREE.PointLight[] = [];
	private readonly lastCameraPosition = new THREE.Vector3(
		Number.POSITIVE_INFINITY,
		Number.POSITIVE_INFINITY,
		Number.POSITIVE_INFINITY
	);
	private readonly candidates: EmissiveLightCandidate[] = [];
	private candidatesDirty = true;

	constructor(private readonly scene: THREE.Scene) {
		for (let index = 0; index < MAX_ACTIVE_EMISSIVE_LIGHTS; index += 1) {
			const light = new THREE.PointLight('#ffe49e', EMISSIVE_LIGHT_INTENSITY, 0, 2);
			light.castShadow = false;
			light.visible = false;
			this.lightPool.push(light);
			this.scene.add(light);
		}
	}

	invalidateCandidates(): void {
		this.candidatesDirty = true;
	}

	sync(world: VoxelWorld, cameraPosition: THREE.Vector3): void {
		if (this.candidatesDirty) {
			this.rebuildCandidates(world);
		} else if (
			this.lastCameraPosition.distanceToSquared(cameraPosition) <= CAMERA_RESYNC_DISTANCE_SQ
		) {
			return;
		}

		this.lastCameraPosition.copy(cameraPosition);

		const nearestCandidates = [...this.candidates]
			.sort((a, b) => {
				const distanceA = a.position.distanceToSquared(cameraPosition);
				const distanceB = b.position.distanceToSquared(cameraPosition);
				return distanceA - distanceB || a.blockId - b.blockId;
			})
			.slice(0, MAX_ACTIVE_EMISSIVE_LIGHTS);

		for (let index = 0; index < this.lightPool.length; index += 1) {
			const light = this.lightPool[index];
			const candidate = nearestCandidates[index];

			if (!light) {
				continue;
			}

			if (!candidate) {
				light.visible = false;
				continue;
			}

			light.visible = true;
			light.position.copy(candidate.position);
			light.color.copy(candidate.color);
			light.intensity = EMISSIVE_LIGHT_INTENSITY;
			light.distance = candidate.distance;
		}
	}

	dispose(): void {
		for (const light of this.lightPool) {
			this.scene.remove(light);
		}
	}

	private rebuildCandidates(world: VoxelWorld): void {
		this.candidates.length = 0;

		for (const block of world.blocks.values()) {
			if (!doesVoxelEmitLight(block.materialId)) {
				continue;
			}

			const lightTint = getVoxelLightTint(block.materialId);
			const halfSize = block.size * VOXEL_WORLD_SIZE * 0.5;

			this.candidates.push({
				blockId: block.id,
				position: new THREE.Vector3(
					block.origin.x * VOXEL_WORLD_SIZE + halfSize,
					block.origin.y * VOXEL_WORLD_SIZE + halfSize,
					block.origin.z * VOXEL_WORLD_SIZE + halfSize
				),
				color: new THREE.Color(lightTint[0], lightTint[1], lightTint[2]),
				distance: EMISSIVE_LIGHT_DISTANCE_BASE * Math.max(1, block.size)
			});
		}

		this.candidatesDirty = false;
	}
}
