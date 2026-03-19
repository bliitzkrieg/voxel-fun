import type { VoxelId } from '$lib/voxel/voxelTypes';

export interface VoxelPaletteEntry {
	id: number;
	name: string;
	color: [number, number, number];
	category: 'structure' | 'trim' | 'glass' | 'detail';
}

export const VOXEL_CONCRETE = 1;
export const VOXEL_BRICK = 2;
export const VOXEL_PAINTED_WALL = 3;
export const VOXEL_DARK_TRIM = 4;
export const VOXEL_METAL = 5;
export const VOXEL_ASPHALT = 6;
export const VOXEL_TILE = 7;
export const VOXEL_GLASS = 8;
export const VOXEL_ROOF = 9;

export const VOXEL_PALETTE: VoxelPaletteEntry[] = [
	{
		id: VOXEL_CONCRETE,
		name: 'Concrete',
		color: [0.62, 0.62, 0.6],
		category: 'structure'
	},
	{
		id: VOXEL_BRICK,
		name: 'Brick',
		color: [0.55, 0.24, 0.2],
		category: 'structure'
	},
	{
		id: VOXEL_PAINTED_WALL,
		name: 'Painted Wall',
		color: [0.8, 0.78, 0.72],
		category: 'structure'
	},
	{
		id: VOXEL_DARK_TRIM,
		name: 'Dark Trim',
		color: [0.16, 0.18, 0.2],
		category: 'trim'
	},
	{
		id: VOXEL_METAL,
		name: 'Metal',
		color: [0.48, 0.5, 0.55],
		category: 'detail'
	},
	{
		id: VOXEL_ASPHALT,
		name: 'Asphalt',
		color: [0.18, 0.19, 0.21],
		category: 'structure'
	},
	{
		id: VOXEL_TILE,
		name: 'Tile',
		color: [0.69, 0.7, 0.73],
		category: 'detail'
	},
	{
		id: VOXEL_GLASS,
		name: 'Glass Placeholder',
		color: [0.58, 0.72, 0.78],
		category: 'glass'
	},
	{
		id: VOXEL_ROOF,
		name: 'Roof Material',
		color: [0.33, 0.22, 0.18],
		category: 'structure'
	}
];

export const DEFAULT_SELECTED_VOXEL_ID = VOXEL_CONCRETE;

const voxelPaletteById = new Map(VOXEL_PALETTE.map((entry) => [entry.id, entry]));
const voxelMaterialIds = VOXEL_PALETTE.map((entry) => entry.id);

export function getVoxelPaletteEntry(id: VoxelId): VoxelPaletteEntry | null {
	return voxelPaletteById.get(id) ?? null;
}

export function getVoxelColor(id: VoxelId): [number, number, number] {
	return getVoxelPaletteEntry(id)?.color ?? [1, 0, 1];
}

export function getVoxelMaterialIds(): VoxelId[] {
	return [...voxelMaterialIds];
}

export function cycleVoxelMaterialId(currentId: VoxelId, step: number): VoxelId {
	const clampedStep = Math.trunc(step);

	if (voxelMaterialIds.length === 0 || clampedStep === 0) {
		return currentId;
	}

	const currentIndex = Math.max(0, voxelMaterialIds.indexOf(currentId));
	const nextIndex =
		(((currentIndex + clampedStep) % voxelMaterialIds.length) + voxelMaterialIds.length) %
		voxelMaterialIds.length;

	return voxelMaterialIds[nextIndex] ?? currentId;
}
