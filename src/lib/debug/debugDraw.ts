import * as THREE from 'three';

import { CHUNK_SIZE } from '$lib/voxel/constants';
import type { ChunkCoord } from '$lib/voxel/voxelTypes';

export function createChunkBoundsHelper(
	coord: ChunkCoord,
	color: THREE.ColorRepresentation = 0x202428
): THREE.LineSegments {
	const geometry = new THREE.EdgesGeometry(
		new THREE.BoxGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)
	);
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity: 0.18
	});
	const helper = new THREE.LineSegments(geometry, material);

	helper.position.set(
		coord.x * CHUNK_SIZE + CHUNK_SIZE * 0.5,
		coord.y * CHUNK_SIZE + CHUNK_SIZE * 0.5,
		coord.z * CHUNK_SIZE + CHUNK_SIZE * 0.5
	);

	return helper;
}

export function disposeDebugObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;
		if (mesh.geometry) {
			mesh.geometry.dispose();
		}

		if (Array.isArray(mesh.material)) {
			for (const material of mesh.material) {
				material.dispose();
			}
		} else if (mesh.material) {
			mesh.material.dispose();
		}
	});
}
