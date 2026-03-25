import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
import { DEFAULT_VOXEL_SIZE } from '$lib/voxel/constants';
import { DEFAULT_SELECTED_VOXEL_ID } from '$lib/voxel/voxelPalette';

export type EditorToolType =
	| 'brush-add'
	| 'brush-remove'
	| 'brush-paint'
	| 'face-extrude'
	| 'box-fill'
	| 'box-hollow'
	| 'box-carve'
	| 'box-paint'
	| 'nature-grass'
	| 'nature-flower'
	| 'nature-tree';

export type EditorMode = 'add' | 'remove' | 'paint';
export type BoxToolMode = 'solid' | 'hollow' | 'carve' | 'paint';
export type DragMode = 'single' | 'region';

export interface EditorState {
	enabled: boolean;
	selectionEnabled: boolean;
	activeTool: EditorToolType;
	selectedVoxelId: number;
	selectedVoxelSize: number;
	dragStart: WorldCoord | null;
	hoverHit: VoxelHit | null;
	mode: EditorMode;
	previewBox: WorldBox | null;
	dragMode: DragMode;
}

export function createEditorState(): EditorState {
	return {
		enabled: false,
		selectionEnabled: false,
		activeTool: 'brush-add',
		selectedVoxelId: DEFAULT_SELECTED_VOXEL_ID,
		selectedVoxelSize: DEFAULT_VOXEL_SIZE,
		dragStart: null,
		hoverHit: null,
		mode: 'add',
		previewBox: null,
		dragMode: 'single'
	};
}

export function isBoxTool(tool: EditorToolType): boolean {
	return tool.startsWith('box-');
}

export function getEditorModeForTool(tool: EditorToolType): EditorMode {
	switch (tool) {
		case 'brush-remove':
		case 'box-carve':
			return 'remove';
		case 'brush-paint':
		case 'box-paint':
			return 'paint';
		default:
			return 'add';
	}
}

export function getBoxToolMode(tool: EditorToolType): BoxToolMode | null {
	switch (tool) {
		case 'box-fill':
			return 'solid';
		case 'box-hollow':
			return 'hollow';
		case 'box-carve':
			return 'carve';
		case 'box-paint':
			return 'paint';
		default:
			return null;
	}
}

export function getInteractionBoxToolMode(
	tool: EditorToolType,
	dragMode: DragMode
): BoxToolMode | null {
	const explicitBoxMode = getBoxToolMode(tool);

	if (explicitBoxMode) {
		return explicitBoxMode;
	}

	if (dragMode !== 'region') {
		return null;
	}

	switch (tool) {
		case 'brush-add':
			return 'solid';
		case 'brush-remove':
			return 'carve';
		case 'brush-paint':
			return 'paint';
		default:
			return null;
	}
}

export function setActiveEditorTool(state: EditorState, tool: EditorToolType): void {
	state.activeTool = tool;
	state.mode = getEditorModeForTool(tool);
}

export function getEditorToolLabel(tool: EditorToolType): string {
	switch (tool) {
		case 'brush-add':
			return 'Brush Add';
		case 'brush-remove':
			return 'Brush Remove';
		case 'brush-paint':
			return 'Brush Paint';
		case 'face-extrude':
			return 'Face Extrude';
		case 'box-fill':
			return 'Box Fill';
		case 'box-hollow':
			return 'Box Hollow';
		case 'box-carve':
			return 'Box Carve';
		case 'box-paint':
			return 'Box Paint';
		case 'nature-grass':
			return 'Nature Grass';
		case 'nature-flower':
			return 'Nature Flowers';
		case 'nature-tree':
			return 'Nature Tree';
	}
}
