import type { EditorToolType } from '$lib/editor/editorState';
import { normalizeWorldBox } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';

export function getToolTargetCoord(
	tool: EditorToolType,
	hit: VoxelHit | null,
	size = 1
): WorldCoord | null {
	if (!hit) {
		return null;
	}

	if (tool === 'brush-add' || tool === 'box-fill' || tool === 'box-hollow') {
		return getPlacementOrigin(hit, size);
	}

	return { ...hit.block.origin };
}

export function createPreviewBox(a: WorldCoord, b: WorldCoord, cellSpan = 1): WorldBox {
	const bounds = normalizeWorldBox(a, b);

	return {
		min: bounds.min,
		max: {
			x: bounds.max.x + cellSpan - 1,
			y: bounds.max.y + cellSpan - 1,
			z: bounds.max.z + cellSpan - 1
		}
	};
}

export function worldCoordToKey(coord: WorldCoord): string {
	return `${coord.x},${coord.y},${coord.z}`;
}

function getPlacementOrigin(hit: VoxelHit, size: number): WorldCoord {
	const origin = {
		x: hit.voxel.x,
		y: hit.voxel.y,
		z: hit.voxel.z
	};

	if (hit.normal.x !== 0) {
		origin.x = hit.normal.x > 0 ? hit.block.origin.x + hit.block.size : hit.block.origin.x - size;
	}

	if (hit.normal.y !== 0) {
		origin.y = hit.normal.y > 0 ? hit.block.origin.y + hit.block.size : hit.block.origin.y - size;
	}

	if (hit.normal.z !== 0) {
		origin.z = hit.normal.z > 0 ? hit.block.origin.z + hit.block.size : hit.block.origin.z - size;
	}

	return origin;
}
