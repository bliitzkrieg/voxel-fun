import { DEFAULT_VOXEL_SIZE } from '$lib/voxel/constants';
import {
	VOXEL_ASPHALT,
	VOXEL_BRICK,
	VOXEL_CONCRETE,
	VOXEL_DARK_TRIM,
	VOXEL_GLASS,
	VOXEL_METAL,
	VOXEL_PAINTED_WALL,
	VOXEL_ROOF,
	VOXEL_TILE
} from '$lib/voxel/voxelPalette';
import {
	carveBoxCommand,
	createVoxelCommandResult,
	fillBoxCommand,
	hollowBoxCommand,
	mergeVoxelCommandResult,
	setVoxelCommand,
	paintBoxCommand,
	type VoxelCommandResult
} from '$lib/voxel/voxelCommands';
import type { WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

export function buildDenseTestSlice(world: VoxelWorld): VoxelCommandResult {
	const result = createVoxelCommandResult();
	const shellMin: WorldCoord = { x: 0, y: 1, z: 23 };
	const shellMax: WorldCoord = { x: 32, y: 12, z: 40 };

	fill(result, world, { x: -12, y: 0, z: -14 }, { x: 44, y: 0, z: 18 }, VOXEL_ASPHALT);
	fill(result, world, { x: -12, y: 0, z: 19 }, { x: 44, y: 0, z: 22 }, VOXEL_CONCRETE);
	fill(result, world, { x: -12, y: 1, z: 18 }, { x: 44, y: 1, z: 18 }, VOXEL_CONCRETE);
	fill(result, world, { x: 14, y: 0, z: 21 }, { x: 18, y: 0, z: 22 }, VOXEL_TILE);

	hollow(result, world, shellMin, shellMax, VOXEL_PAINTED_WALL);
	carve(result, world, { x: 1, y: 1, z: 24 }, { x: 31, y: 11, z: 39 });

	fill(result, world, { x: 1, y: 0, z: 24 }, { x: 31, y: 0, z: 39 }, VOXEL_CONCRETE);
	paint(result, world, { x: 13, y: 0, z: 24 }, { x: 19, y: 0, z: 39 }, VOXEL_TILE);
	paint(result, world, { x: 21, y: 0, z: 24 }, { x: 31, y: 0, z: 39 }, VOXEL_METAL);
	paint(result, world, { x: 0, y: 1, z: 23 }, { x: 32, y: 11, z: 23 }, VOXEL_BRICK);
	paint(result, world, { x: 0, y: 9, z: 23 }, { x: 32, y: 9, z: 23 }, VOXEL_DARK_TRIM);
	paint(result, world, { x: 1, y: 12, z: 24 }, { x: 31, y: 12, z: 39 }, VOXEL_ROOF);

	fill(result, world, { x: 0, y: 13, z: 23 }, { x: 32, y: 13, z: 23 }, VOXEL_DARK_TRIM);
	fill(result, world, { x: 0, y: 13, z: 40 }, { x: 32, y: 13, z: 40 }, VOXEL_DARK_TRIM);
	fill(result, world, { x: 0, y: 13, z: 24 }, { x: 0, y: 13, z: 39 }, VOXEL_DARK_TRIM);
	fill(result, world, { x: 32, y: 13, z: 24 }, { x: 32, y: 13, z: 39 }, VOXEL_DARK_TRIM);

	fill(result, world, { x: 12, y: 1, z: 24 }, { x: 12, y: 11, z: 39 }, VOXEL_PAINTED_WALL);
	fill(result, world, { x: 20, y: 1, z: 24 }, { x: 20, y: 11, z: 39 }, VOXEL_PAINTED_WALL);
	paint(result, world, { x: 12, y: 2, z: 24 }, { x: 12, y: 2, z: 39 }, VOXEL_DARK_TRIM);
	paint(result, world, { x: 20, y: 2, z: 24 }, { x: 20, y: 2, z: 39 }, VOXEL_DARK_TRIM);

	carve(result, world, { x: 15, y: 1, z: 23 }, { x: 17, y: 8, z: 23 });
	carve(result, world, { x: 4, y: 4, z: 23 }, { x: 7, y: 8, z: 23 });
	carve(result, world, { x: 24, y: 4, z: 23 }, { x: 27, y: 8, z: 23 });
	carve(result, world, { x: 12, y: 1, z: 27 }, { x: 12, y: 8, z: 29 });
	carve(result, world, { x: 20, y: 1, z: 31 }, { x: 20, y: 8, z: 33 });
	carve(result, world, { x: 32, y: 5, z: 29 }, { x: 32, y: 9, z: 33 });

	fill(result, world, { x: 4, y: 4, z: 24 }, { x: 7, y: 8, z: 24 }, VOXEL_GLASS);
	fill(result, world, { x: 24, y: 4, z: 24 }, { x: 27, y: 8, z: 24 }, VOXEL_GLASS);
	fill(result, world, { x: 31, y: 5, z: 29 }, { x: 31, y: 9, z: 33 }, VOXEL_GLASS);

	paint(result, world, { x: 3, y: 3, z: 23 }, { x: 8, y: 9, z: 23 }, VOXEL_DARK_TRIM);
	paint(result, world, { x: 23, y: 3, z: 23 }, { x: 28, y: 9, z: 23 }, VOXEL_DARK_TRIM);
	paint(result, world, { x: 14, y: 1, z: 23 }, { x: 18, y: 9, z: 23 }, VOXEL_DARK_TRIM);

	fill(result, world, { x: 22, y: 7, z: 24 }, { x: 31, y: 7, z: 28 }, VOXEL_METAL);
	fill(result, world, { x: 22, y: 7, z: 29 }, { x: 24, y: 7, z: 31 }, VOXEL_METAL);
	fill(result, world, { x: 25, y: 7, z: 24 }, { x: 25, y: 11, z: 24 }, VOXEL_DARK_TRIM);

	fill(result, world, { x: 23, y: 0, z: 37 }, { x: 26, y: 0, z: 38 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 1, z: 35 }, { x: 26, y: 1, z: 36 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 2, z: 33 }, { x: 26, y: 2, z: 34 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 3, z: 31 }, { x: 26, y: 3, z: 32 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 4, z: 29 }, { x: 26, y: 4, z: 30 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 5, z: 27 }, { x: 26, y: 5, z: 28 }, VOXEL_CONCRETE);
	fill(result, world, { x: 23, y: 6, z: 25 }, { x: 26, y: 6, z: 26 }, VOXEL_CONCRETE);

	fill(result, world, { x: 2, y: 0, z: 24 }, { x: 10, y: 0, z: 39 }, VOXEL_TILE);
	paint(result, world, { x: 1, y: 1, z: 24 }, { x: 11, y: 2, z: 39 }, VOXEL_DARK_TRIM);
	paint(result, world, { x: 21, y: 1, z: 24 }, { x: 31, y: 2, z: 39 }, VOXEL_DARK_TRIM);
	addSizedBlock(result, world, { x: -9, y: 1, z: -8 }, VOXEL_METAL, 2);
	addSizedBlock(result, world, { x: -4, y: 1, z: -8 }, VOXEL_GLASS, 4);
	addSizedBlock(result, world, { x: 36, y: 1, z: -10 }, VOXEL_BRICK, 8);

	return result;
}

function fill(
	result: VoxelCommandResult,
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: number
): void {
	mergeVoxelCommandResult(
		result,
		fillBoxCommand(world, scaleBoxMin(min), scaleBoxMax(max), voxelId, DEFAULT_VOXEL_SIZE)
	);
}

function hollow(
	result: VoxelCommandResult,
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: number
): void {
	mergeVoxelCommandResult(
		result,
		hollowBoxCommand(world, scaleBoxMin(min), scaleBoxMax(max), voxelId, DEFAULT_VOXEL_SIZE)
	);
}

function carve(
	result: VoxelCommandResult,
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord
): void {
	mergeVoxelCommandResult(result, carveBoxCommand(world, scaleBoxMin(min), scaleBoxMax(max)));
}

function paint(
	result: VoxelCommandResult,
	world: VoxelWorld,
	min: WorldCoord,
	max: WorldCoord,
	voxelId: number
): void {
	mergeVoxelCommandResult(
		result,
		paintBoxCommand(world, scaleBoxMin(min), scaleBoxMax(max), voxelId)
	);
}

function addSizedBlock(
	result: VoxelCommandResult,
	world: VoxelWorld,
	origin: WorldCoord,
	voxelId: number,
	size: number
): void {
	mergeVoxelCommandResult(
		result,
		setVoxelCommand(
			world,
			origin.x * DEFAULT_VOXEL_SIZE,
			origin.y * DEFAULT_VOXEL_SIZE,
			origin.z * DEFAULT_VOXEL_SIZE,
			voxelId,
			size
		)
	);
}

function scaleBoxMin(coord: WorldCoord): WorldCoord {
	return {
		x: coord.x * DEFAULT_VOXEL_SIZE,
		y: coord.y * DEFAULT_VOXEL_SIZE,
		z: coord.z * DEFAULT_VOXEL_SIZE
	};
}

function scaleBoxMax(coord: WorldCoord): WorldCoord {
	return {
		x: (coord.x + 1) * DEFAULT_VOXEL_SIZE - 1,
		y: (coord.y + 1) * DEFAULT_VOXEL_SIZE - 1,
		z: (coord.z + 1) * DEFAULT_VOXEL_SIZE - 1
	};
}
