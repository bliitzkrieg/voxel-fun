import * as THREE from 'three';

import { CHUNK_SIZE } from '$lib/voxel/constants';
import type { VoxelChunk } from '$lib/voxel/chunk';
import type { MeshBuffers } from '$lib/voxel/mesher';

export class ChunkMesh {
	chunk: VoxelChunk;
	mesh: THREE.Mesh;

	constructor(chunk: VoxelChunk, material: THREE.Material) {
		this.chunk = chunk;
		this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
		this.mesh.position.set(
			chunk.coord.x * CHUNK_SIZE,
			chunk.coord.y * CHUNK_SIZE,
			chunk.coord.z * CHUNK_SIZE
		);
	}

	update(buffers: MeshBuffers): void {
		const geometry = new THREE.BufferGeometry();

		geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
		geometry.setIndex(buffers.indices);

		if (buffers.positions.length > 0) {
			geometry.computeBoundingSphere();
		} else {
			geometry.boundingSphere = new THREE.Sphere(
				new THREE.Vector3(CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.5),
				0
			);
		}

		const previousGeometry = this.mesh.geometry;
		this.mesh.geometry = geometry;
		previousGeometry.dispose();
	}

	dispose(): void {
		this.mesh.geometry.dispose();
	}
}
