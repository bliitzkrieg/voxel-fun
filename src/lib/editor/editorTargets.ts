import type { BoxConstraint, EditorToolType } from '$lib/editor/editorState';
import { normalizeWorldBox } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';

export function getToolTargetCoord(tool: EditorToolType, hit: VoxelHit | null): WorldCoord | null {
	if (!hit) {
		return null;
	}

	if (tool === 'brush-add' || tool === 'box-fill' || tool === 'box-hollow') {
		return {
			x: hit.voxel.x + hit.normal.x,
			y: hit.voxel.y + hit.normal.y,
			z: hit.voxel.z + hit.normal.z
		};
	}

	return { ...hit.voxel };
}

export function constrainTargetCoord(
	anchor: WorldCoord,
	current: WorldCoord,
	constraint: BoxConstraint
): WorldCoord {
	switch (constraint) {
		case 'horizontal':
			return { x: current.x, y: anchor.y, z: current.z };
		case 'vertical-x':
			return { x: anchor.x, y: current.y, z: current.z };
		case 'vertical-z':
			return { x: current.x, y: current.y, z: anchor.z };
		default:
			return current;
	}
}

export function createPreviewBox(a: WorldCoord, b: WorldCoord): WorldBox {
	return normalizeWorldBox(a, b);
}

export function worldCoordToKey(coord: WorldCoord): string {
	return `${coord.x},${coord.y},${coord.z}`;
}
