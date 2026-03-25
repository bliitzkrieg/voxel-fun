import { CHUNK_SIZE, VOXEL_AIR } from '$lib/voxel/constants';
import {
	doesVoxelEmitLight,
	getVoxelColor,
	getVoxelLightTint,
	getVoxelOpacity,
	getVoxelSurfaceProfile,
	isWaterVoxelMaterial
} from '$lib/voxel/voxelPalette';
import type { VoxelChunk } from '$lib/voxel/chunk';
import type { VoxelWorld } from '$lib/voxel/world';

export interface MeshSurfaceBuffers {
	positions: number[];
	normals: number[];
	colors: number[];
	ao: number[];
	surface: number[];
	emissive: number[];
	water: number[];
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
				const surfaceProfile = getVoxelSurfaceProfile(voxelId);
				const lightTint = emitsLight ? getVoxelLightTint(voxelId) : null;
				const emissiveSurfaceColor = lightTint
					? ([lightTint[0] * 0.34, lightTint[1] * 0.34, lightTint[2] * 0.34] as const)
					: ([0, 0, 0] as const);
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
					const faceAo = computeFaceAmbientOcclusion(world, wx, wy, wz, face);
					const waterData = isWater
						? computeWaterFaceData(world, wx, wy, wz, face, faceAo)
						: ([0, 0] as const);

					for (let vertexIndex = 0; vertexIndex < face.vertices.length; vertexIndex += 1) {
						const vertex = face.vertices[vertexIndex];

						if (!vertex) {
							continue;
						}

						targetBuffers.positions.push(lx + vertex[0], ly + vertex[1], lz + vertex[2]);
						targetBuffers.normals.push(face.normal[0], face.normal[1], face.normal[2]);
						targetBuffers.ao.push(faceAo[vertexIndex] ?? 1);
						targetBuffers.surface.push(
							surfaceProfile.roughness,
							surfaceProfile.metalness,
							surfaceProfile.bounce,
							surfaceProfile.highlight
						);
						targetBuffers.emissive.push(
							emissiveSurfaceColor[0],
							emissiveSurfaceColor[1],
							emissiveSurfaceColor[2]
						);
						targetBuffers.water.push(waterData[0], waterData[1]);

						if (targetBuffers.colorSize === 4) {
							targetBuffers.colors.push(color[0], color[1], color[2], opacity);
						} else {
							targetBuffers.colors.push(color[0], color[1], color[2]);
						}

						if (emitsLight && lightTint) {
							buffers.glow.positions.push(lx + vertex[0], ly + vertex[1], lz + vertex[2]);
							buffers.glow.normals.push(face.normal[0], face.normal[1], face.normal[2]);
							buffers.glow.ao.push(1);
							buffers.glow.surface.push(0, 0, 0, 0);
							buffers.glow.emissive.push(0, 0, 0);
							buffers.glow.water.push(0, 0);
							buffers.glow.colors.push(
								lightTint[0],
								lightTint[1],
								lightTint[2],
								EMISSIVE_GLOW_ALPHA
							);
						}
					}

					pushQuadIndices(targetBuffers.indices, baseIndex, faceAo);

					if (emitsLight) {
						const glowBaseIndex = buffers.glow.positions.length / 3 - 4;
						pushQuadIndices(buffers.glow.indices, glowBaseIndex, faceAo);
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
		ao: [],
		surface: [],
		emissive: [],
		water: [],
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

function pushQuadIndices(
	indices: number[],
	baseIndex: number,
	ambientOcclusion: readonly [number, number, number, number]
): void {
	// Match the quad split to the AO gradient so recessed corners don't show a hard diagonal seam.
	if (ambientOcclusion[0] + ambientOcclusion[2] > ambientOcclusion[1] + ambientOcclusion[3]) {
		indices.push(
			baseIndex,
			baseIndex + 1,
			baseIndex + 3,
			baseIndex + 1,
			baseIndex + 2,
			baseIndex + 3
		);
		return;
	}

	indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
}

function computeFaceAmbientOcclusion(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	face: FaceDef
): [number, number, number, number] {
	const axis = Math.abs(face.normal[0]) > 0 ? 0 : Math.abs(face.normal[1]) > 0 ? 1 : 2;
	const tangentAxisA = ((axis + 1) % 3) as 0 | 1 | 2;
	const tangentAxisB = ((axis + 2) % 3) as 0 | 1 | 2;

	return face.vertices.map((vertex) =>
		computeVertexAmbientOcclusion(
			world,
			x,
			y,
			z,
			axis,
			face.normal[axis] ?? 1,
			tangentAxisA,
			tangentAxisB,
			vertex
		)
	) as [number, number, number, number];
}

function computeVertexAmbientOcclusion(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	axis: 0 | 1 | 2,
	normalStep: number,
	tangentAxisA: 0 | 1 | 2,
	tangentAxisB: 0 | 1 | 2,
	vertex: readonly [number, number, number]
): number {
	const offsets = [0, 0, 0];
	offsets[axis] = normalStep;

	const sideAStep = vertex[tangentAxisA] === 0 ? -1 : 1;
	const sideBStep = vertex[tangentAxisB] === 0 ? -1 : 1;
	const sideA = getVoxelOcclusionFactor(
		world.getVoxel(
			x + offsets[0] + (tangentAxisA === 0 ? sideAStep : 0),
			y + offsets[1] + (tangentAxisA === 1 ? sideAStep : 0),
			z + offsets[2] + (tangentAxisA === 2 ? sideAStep : 0)
		)
	);
	const sideB = getVoxelOcclusionFactor(
		world.getVoxel(
			x + offsets[0] + (tangentAxisB === 0 ? sideBStep : 0),
			y + offsets[1] + (tangentAxisB === 1 ? sideBStep : 0),
			z + offsets[2] + (tangentAxisB === 2 ? sideBStep : 0)
		)
	);
	const corner = getVoxelOcclusionFactor(
		world.getVoxel(
			x + offsets[0] + (tangentAxisA === 0 ? sideAStep : 0) + (tangentAxisB === 0 ? sideBStep : 0),
			y + offsets[1] + (tangentAxisA === 1 ? sideAStep : 0) + (tangentAxisB === 1 ? sideBStep : 0),
			z + offsets[2] + (tangentAxisA === 2 ? sideAStep : 0) + (tangentAxisB === 2 ? sideBStep : 0)
		)
	);

	if (sideA >= 0.98 && sideB >= 0.98) {
		return 0.34;
	}

	const combinedOcclusion = (sideA + sideB + corner) / 3;
	return clamp01(1 - combinedOcclusion * 0.78, 0.34, 1);
}

function computeWaterFaceData(
	world: VoxelWorld,
	x: number,
	y: number,
	z: number,
	face: FaceDef,
	ambientOcclusion: readonly [number, number, number, number]
): readonly [number, number] {
	let thickness = 1;

	for (let step = 1; step <= 6; step += 1) {
		const neighborId = world.getVoxel(
			x - face.normal[0] * step,
			y - face.normal[1] * step,
			z - face.normal[2] * step
		);

		if (!isWaterVoxelMaterial(neighborId)) {
			break;
		}

		thickness += 1;
	}

	const openness =
		(ambientOcclusion[0] + ambientOcclusion[1] + ambientOcclusion[2] + ambientOcclusion[3]) /
		ambientOcclusion.length;

	return [clamp01(thickness / 6, 0, 1), clamp01(openness, 0, 1)];
}

function getVoxelOcclusionFactor(voxelId: number): number {
	if (voxelId === VOXEL_AIR) {
		return 0;
	}

	if (isWaterVoxelMaterial(voxelId)) {
		return 0.12;
	}

	const opacity = getVoxelOpacity(voxelId);

	if (opacity < 1) {
		return 0.2 + opacity * 0.28;
	}

	return doesVoxelEmitLight(voxelId) ? 0.82 : 1;
}

function clamp01(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
