export const NATURE_BASE_VOXEL_SIZE = 2;
export const NATURE_DETAIL_VOXEL_SIZE = 1;

export function snapNatureGridCoord(value: number): number {
	return Math.floor(value / NATURE_BASE_VOXEL_SIZE) * NATURE_BASE_VOXEL_SIZE;
}

export function natureUnitsToWorld(value: number): number {
	return value * NATURE_BASE_VOXEL_SIZE;
}

export function getNatureBrushPreviewScale(radius: number): number {
	return natureUnitsToWorld(radius + 0.58);
}

export function getNatureGridCenterOffset(): number {
	return NATURE_BASE_VOXEL_SIZE * 0.5;
}

export function getNatureGridValue(value: number): number {
	return Math.floor(value / NATURE_BASE_VOXEL_SIZE);
}
