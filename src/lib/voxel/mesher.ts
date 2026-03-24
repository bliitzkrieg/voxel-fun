import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import { getVoxelColor } from '$lib/voxel/voxelPalette';
import type { VoxelChunk } from '$lib/voxel/chunk';
import type { VoxelWorld } from '$lib/voxel/world';

export interface MeshBuffers {
	positions: number[];
	normals: number[];
	colors: number[];
	indices: number[];
}

interface FaceDef {
	name: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
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
		name: 'px',
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
		name: 'nx',
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
		name: 'py',
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
		name: 'ny',
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
		name: 'pz',
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
		name: 'nz',
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
		positions: [],
		normals: [],
		colors: [],
		indices: []
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

				for (const face of FACE_DEFS) {
					const neighborId = world.getVoxel(
						wx + face.neighbor[0],
						wy + face.neighbor[1],
						wz + face.neighbor[2]
					);

					if (neighborId !== VOXEL_AIR) {
						continue;
					}

					const baseIndex = buffers.positions.length / 3;

					for (const vertex of face.vertices) {
						buffers.positions.push(lx + vertex[0], ly + vertex[1], lz + vertex[2]);
						buffers.normals.push(face.normal[0], face.normal[1], face.normal[2]);
						buffers.colors.push(color[0], color[1], color[2]);
					}

					buffers.indices.push(
						baseIndex,
						baseIndex + 1,
						baseIndex + 2,
						baseIndex,
						baseIndex + 2,
						baseIndex + 3
					);
				}
			}
		}
	}

	return buffers;
}
