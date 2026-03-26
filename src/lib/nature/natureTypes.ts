export type NaturePreset = 'grass' | 'trees' | 'flowers' | 'bushes';
export type NatureActiveTool = 'grass-paint' | 'tree-place' | 'flower-paint' | 'bush-place';
export type NatureEditorTool = 'nature-grass' | 'nature-tree' | 'nature-flower' | 'nature-bush';
export type NatureRole = 'grass' | 'leaf' | 'bark' | 'flower';
export type NatureGrassHeightVariance = 'low' | 'medium' | 'high';
export type NatureTreeSize = 'small' | 'medium' | 'large';
export type NatureBushSize = 'small' | 'medium' | 'large';
export type NatureBushDensity = 'sparse' | 'balanced' | 'lush';
export type NatureFlowerColorMode = 'random' | 'scarlet' | 'cobalt' | 'amber' | 'violet';

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

export interface NatureBushSettings {
	size: NatureBushSize;
	density: NatureBushDensity;
	seedOffset: number;
}

export interface NatureFlowerSettings {
	radius: number;
	density: number;
	seedOffset: number;
	blossomColor: NatureFlowerColorMode;
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

export const DEFAULT_NATURE_BUSH_SETTINGS: NatureBushSettings = {
	size: 'medium',
	density: 'balanced',
	seedOffset: 0
};

export const DEFAULT_NATURE_FLOWER_SETTINGS: NatureFlowerSettings = {
	radius: 4,
	density: 0.34,
	seedOffset: 0,
	blossomColor: 'random'
};

export function getNatureToolForPreset(preset: NaturePreset): NatureActiveTool {
	switch (preset) {
		case 'grass':
			return 'grass-paint';
		case 'bushes':
			return 'bush-place';
		case 'flowers':
			return 'flower-paint';
		default:
			return 'tree-place';
	}
}

export function getNatureEditorToolForPreset(preset: NaturePreset): NatureEditorTool {
	switch (preset) {
		case 'grass':
			return 'nature-grass';
		case 'bushes':
			return 'nature-bush';
		case 'flowers':
			return 'nature-flower';
		default:
			return 'nature-tree';
	}
}

export function getNaturePresetForTool(tool: NatureActiveTool | NatureEditorTool): NaturePreset {
	switch (tool) {
		case 'grass-paint':
		case 'nature-grass':
			return 'grass';
		case 'bush-place':
		case 'nature-bush':
			return 'bushes';
		case 'flower-paint':
		case 'nature-flower':
			return 'flowers';
		default:
			return 'trees';
	}
}
