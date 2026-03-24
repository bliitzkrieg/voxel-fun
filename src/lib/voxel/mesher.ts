import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import {
	doesVoxelEmitLight,
	getVoxelColor,
	getVoxelLightTint,
	getVoxelOpacity,
	isWaterVoxelMaterial
} from '$lib/voxel/voxelPalette';
import type { VoxelChunk } from '$lib/voxel/chunk';
import type { VoxelWorld } from '$lib/voxel/world';

export interface MeshSurfaceBuffers {
	positions: number[];
	normals: number[];
	colors: number[];
	indices: number[];
	colorSize: 3 | 4;
}

export interface MeshBuffers {
	opaque: MeshSurfaceBuffers;
	transparent: MeshSurfaceBuffers;
	water: MeshSurfaceBuffers;
	glow: MeshSurfaceBuffers;
}

const EMISSIVE_GLOW_ALPHA = 0.6;

interface FaceDef {
	neighbor: [number, number, number];
	normal: [number, number, number];
	vertices: [
		[number, number, number],
		[number, number, number],
		[number, number, number],
		[number, number, number]
	];
}

const FACE_DEFS: FaceDef[] = [
	{
		neighbor: [1, 0, 0],
		normal: [1, 0, 0],
		vertices: [
			[1, 0, 0],
			[1, 1, 0],
			[1, 1, 1],
			[1, 0, 1]
		]
	},
	{
		neighbor: [-1, 0, 0],
		normal: [-1, 0, 0],
		vertices: [
			[0, 0, 1],
			[0, 1, 1],
			[0, 1, 0],
			[0, 0, 0]
		]
	},
	{
		neighbor: [0, 1, 0],
		normal: [0, 1, 0],
		vertices: [
			[0, 1, 1],
			[1, 1, 1],
			[1, 1, 0],
			[0, 1, 0]
		]
	},
	{
		neighbor: [0, -1, 0],
		normal: [0, -1, 0],
		vertices: [
			[0, 0, 0],
			[1, 0, 0],
			[1, 0, 1],
			[0, 0, 1]
		]
	},
	{
		neighbor: [0, 0, 1],
		normal: [0, 0, 1],
		vertices: [
			[0, 0, 1],
			[1, 0, 1],
			[1, 1, 1],
			[0, 1, 1]
		]
	},
	{
		neighbor: [0, 0, -1],
		normal: [0, 0, -1],
		vertices: [
			[0, 1, 0],
			[1, 1, 0],
			[1, 0, 0],
			[0, 0, 0]
		]
	}
];

export function buildChunkMesh(world: VoxelWorld, chunk: VoxelChunk): MeshBuffers {
	const buffers: MeshBuffers = {
		opaque: createMeshSurfaceBuffers(3),
		transparent: createMeshSurfaceBuffers(4),
		water: createMeshSurfaceBuffers(4),
		glow: createMeshSurfaceBuffers(4)
	};

	const chunkWorldX = chunk.coord.x * CHUNK_SIZE;
	const chunkWorldY = chunk.coord.y * CHUNK_SIZE;
	const chunkWorldZ = chunk.coord.z * CHUNK_SIZE;

	for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
		for (let ly = 0; ly < CHUNK_SIZE; ly += 1) {
			for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
				const blockId = chunk.getLocalBlockId(lx, ly, lz);
				const voxelId =
					blockId === 0 ? VOXEL_AIR : (world.blocks.get(blockId)?.materialId ?? VOXEL_AIR);

				if (voxelId === VOXEL_AIR) {
					continue;
				}

				const wx = chunkWorldX + lx;
				const wy = chunkWorldY + ly;
				const wz = chunkWorldZ + lz;
				const color = getVoxelColor(voxelId);
				const opacity = getVoxelOpacity(voxelId);
				const isWater = isWaterVoxelMaterial(voxelId);
				const emitsLight = doesVoxelEmitLight(voxelId);
				const lightTint = emitsLight ? getVoxelLightTint(voxelId) : null;
				const targetBuffers = isWater
					? buffers.water
					: opacity < 1
						? buffers.transparent
						: buffers.opaque;

				for (const face of FACE_DEFS) {
					const neighborId = world.getVoxel(
						wx + face.neighbor[0],
						wy + face.neighbor[1],
						wz + face.neighbor[2]
					);

					if (!shouldRenderFace(voxelId, opacity, isWater, neighborId)) {
						continue;
					}

					const baseIndex = targetBuffers.positions.length / 3;

					for (const vertex of face.vertices) {
						targetBuffers.positions.push(lx + vertex[0], ly + vertex[1], lz + vertex[2]);
						targetBuffers.normals.push(face.normal[0], face.normal[1], face.normal[2]);

						if (targetBuffers.colorSize === 4) {
							targetBuffers.colors.push(color[0], color[1], color[2], opacity);
						} else {
							targetBuffers.colors.push(color[0], color[1], color[2]);
						}

						if (emitsLight && lightTint) {
							buffers.glow.positions.push(lx + vertex[0], ly + vertex[1], lz + vertex[2]);
							buffers.glow.normals.push(face.normal[0], face.normal[1], face.normal[2]);
							buffers.glow.colors.push(
								lightTint[0],
								lightTint[1],
								lightTint[2],
								EMISSIVE_GLOW_ALPHA
							);
						}
					}

					targetBuffers.indices.push(
						baseIndex,
						baseIndex + 1,
						baseIndex + 2,
						baseIndex,
						baseIndex + 2,
						baseIndex + 3
					);

					if (emitsLight) {
						const glowBaseIndex = buffers.glow.positions.length / 3 - 4;
						buffers.glow.indices.push(
							glowBaseIndex,
							glowBaseIndex + 1,
							glowBaseIndex + 2,
							glowBaseIndex,
							glowBaseIndex + 2,
							glowBaseIndex + 3
						);
					}
				}
			}
		}
	}

	return buffers;
}

function createMeshSurfaceBuffers(colorSize: 3 | 4): MeshSurfaceBuffers {
	return {
		positions: [],
		normals: [],
		colors: [],
		indices: [],
		colorSize
	};
}

function shouldRenderFace(
	voxelId: number,
	opacity: number,
	isWater: boolean,
	neighborId: number
): boolean {
	if (neighborId === VOXEL_AIR) {
		return true;
	}

	const currentIsTranslucent = isWater || opacity < 1;

	if (currentIsTranslucent) {
		return false;
	}

	return isTranslucentVoxel(neighborId) && neighborId !== voxelId;
}

function isTranslucentVoxel(voxelId: number): boolean {
	return voxelId !== VOXEL_AIR && (isWaterVoxelMaterial(voxelId) || getVoxelOpacity(voxelId) < 1);
}
