import * as THREE from 'three';

import { CHUNK_SIZE } from '$lib/voxel/constants';
import type { VoxelChunk } from '$lib/voxel/chunk';
import type { MeshBuffers, MeshSurfaceBuffers } from '$lib/voxel/mesher';

export class ChunkMesh {
	chunk: VoxelChunk;
	root: THREE.Group;

	private readonly opaqueMesh: THREE.Mesh;
	private readonly transparentMaterial: THREE.Material;
	private readonly waterMaterial: THREE.Material;
	private readonly glowMaterial: THREE.Material;
	private transparentMesh: THREE.Mesh | null = null;
	private waterMesh: THREE.Mesh | null = null;
	private glowMesh: THREE.Mesh | null = null;

	constructor(
		chunk: VoxelChunk,
		opaqueMaterial: THREE.Material,
		transparentMaterial: THREE.Material,
		waterMaterial: THREE.Material,
		glowMaterial: THREE.Material
	) {
		this.chunk = chunk;
		this.root = new THREE.Group();
		this.root.matrixAutoUpdate = false;
		this.opaqueMesh = new THREE.Mesh(new THREE.BufferGeometry(), opaqueMaterial);
		this.transparentMaterial = transparentMaterial;
		this.waterMaterial = waterMaterial;
		this.glowMaterial = glowMaterial;

		this.opaqueMesh.matrixAutoUpdate = false;
		this.opaqueMesh.castShadow = true;
		this.opaqueMesh.receiveShadow = true;

		this.root.position.set(
			chunk.coord.x * CHUNK_SIZE,
			chunk.coord.y * CHUNK_SIZE,
			chunk.coord.z * CHUNK_SIZE
		);
		this.root.updateMatrix();
		this.root.add(this.opaqueMesh);
	}

	update(buffers: MeshBuffers): void {
		updateMeshGeometry(this.opaqueMesh, buffers.opaque);

		if (buffers.transparent.positions.length > 0) {
			const transparentMesh = this.getTransparentMesh();
			updateMeshGeometry(transparentMesh, buffers.transparent);
			transparentMesh.visible = true;
		} else if (this.transparentMesh) {
			this.root.remove(this.transparentMesh);
			this.transparentMesh.geometry.dispose();
			this.transparentMesh = null;
		}

		if (buffers.water.positions.length > 0) {
			const waterMesh = this.getWaterMesh();
			updateMeshGeometry(waterMesh, buffers.water);
			waterMesh.visible = true;
		} else if (this.waterMesh) {
			this.root.remove(this.waterMesh);
			this.waterMesh.geometry.dispose();
			this.waterMesh = null;
		}

		if (buffers.glow.positions.length > 0) {
			const glowMesh = this.getGlowMesh();
			updateMeshGeometry(glowMesh, buffers.glow);
			glowMesh.visible = true;
		} else if (this.glowMesh) {
			this.root.remove(this.glowMesh);
			this.glowMesh.geometry.dispose();
			this.glowMesh = null;
		}
	}

	dispose(): void {
		this.opaqueMesh.geometry.dispose();

		if (this.transparentMesh) {
			this.transparentMesh.geometry.dispose();
		}

		if (this.waterMesh) {
			this.waterMesh.geometry.dispose();
		}

		if (this.glowMesh) {
			this.glowMesh.geometry.dispose();
		}
	}

	private getTransparentMesh(): THREE.Mesh {
		if (this.transparentMesh) {
			return this.transparentMesh;
		}

		const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.transparentMaterial);
		mesh.matrixAutoUpdate = false;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.renderOrder = 1;
		this.transparentMesh = mesh;
		this.root.add(mesh);
		return mesh;
	}

	private getWaterMesh(): THREE.Mesh {
		if (this.waterMesh) {
			return this.waterMesh;
		}

		const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.waterMaterial);
		mesh.matrixAutoUpdate = false;
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.renderOrder = 2;
		this.waterMesh = mesh;
		this.root.add(mesh);
		return mesh;
	}

	private getGlowMesh(): THREE.Mesh {
		if (this.glowMesh) {
			return this.glowMesh;
		}

		const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMaterial);
		mesh.matrixAutoUpdate = false;
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		mesh.renderOrder = 3;
		this.glowMesh = mesh;
		this.root.add(mesh);
		return mesh;
	}
}

function updateMeshGeometry(mesh: THREE.Mesh, buffers: MeshSurfaceBuffers): void {
	const geometry = new THREE.BufferGeometry();

	geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
	geometry.setAttribute(
		'color',
		new THREE.Float32BufferAttribute(buffers.colors, buffers.colorSize)
	);
	geometry.setIndex(buffers.indices);
	mesh.visible = buffers.positions.length > 0;

	if (buffers.positions.length > 0) {
		geometry.computeBoundingSphere();
	} else {
		geometry.boundingSphere = new THREE.Sphere(
			new THREE.Vector3(CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.5, CHUNK_SIZE * 0.5),
			0
		);
	}

	const previousGeometry = mesh.geometry;
	mesh.geometry = geometry;
	previousGeometry.dispose();
}
