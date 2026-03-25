export type NaturePreset = 'grass' | 'trees';
export type NatureActiveTool = 'grass-paint' | 'tree-place';
export type NatureEditorTool = 'nature-grass' | 'nature-tree';
export type NatureRole = 'grass' | 'leaf' | 'bark';
export type NatureGrassHeightVariance = 'low' | 'medium' | 'high';
export type NatureTreeSize = 'small' | 'medium' | 'large';

export interface NatureGrassSettings {
	radius: number;
	density: number;
	heightVariance: NatureGrassHeightVariance;
	seedOffset: number;
}

export interface NatureTreeSettings {
	size: NatureTreeSize;
	seedOffset: number;
}

export const DEFAULT_NATURE_GRASS_SETTINGS: NatureGrassSettings = {
	radius: 4,
	density: 0.86,
	heightVariance: 'high',
	seedOffset: 0
};

export const DEFAULT_NATURE_TREE_SETTINGS: NatureTreeSettings = {
	size: 'medium',
	seedOffset: 0
};

export function getNatureToolForPreset(preset: NaturePreset): NatureActiveTool {
	return preset === 'grass' ? 'grass-paint' : 'tree-place';
}

export function getNatureEditorToolForPreset(preset: NaturePreset): NatureEditorTool {
	return preset === 'grass' ? 'nature-grass' : 'nature-tree';
}

export function getNaturePresetForTool(tool: NatureActiveTool | NatureEditorTool): NaturePreset {
	return tool === 'grass-paint' || tool === 'nature-grass' ? 'grass' : 'trees';
}
