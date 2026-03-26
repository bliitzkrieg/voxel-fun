import {
	DEFAULT_NATURE_BUSH_SETTINGS,
	DEFAULT_NATURE_FLOWER_SETTINGS,
	DEFAULT_NATURE_GRASS_SETTINGS,
	DEFAULT_NATURE_TREE_SETTINGS,
	type NatureBushSettings,
	getNaturePresetForTool,
	getNatureToolForPreset,
	type NatureActiveTool,
	type NatureFlowerSettings,
	type NatureGrassSettings,
	type NaturePreset,
	type NatureTreeSettings
} from '$lib/nature/natureTypes';

export interface NatureUiState {
	open: boolean;
	radialOpen: boolean;
	radialHoverPreset: NaturePreset | null;
	activePreset: NaturePreset | null;
	activeTool: NatureActiveTool | null;
	grassSettings: NatureGrassSettings;
	bushSettings: NatureBushSettings;
	flowerSettings: NatureFlowerSettings;
	treeSettings: NatureTreeSettings;
}

type NatureUiListener = (state: NatureUiState) => void;

const listeners = new Set<NatureUiListener>();

let state: NatureUiState = {
	open: false,
	radialOpen: false,
	radialHoverPreset: null,
	activePreset: 'grass',
	activeTool: null,
	grassSettings: { ...DEFAULT_NATURE_GRASS_SETTINGS },
	bushSettings: { ...DEFAULT_NATURE_BUSH_SETTINGS },
	flowerSettings: { ...DEFAULT_NATURE_FLOWER_SETTINGS },
	treeSettings: { ...DEFAULT_NATURE_TREE_SETTINGS }
};

export function getNatureUiState(): NatureUiState {
	return {
		open: state.open,
		radialOpen: state.radialOpen,
		radialHoverPreset: state.radialHoverPreset,
		activePreset: state.activePreset,
		activeTool: state.activeTool,
		grassSettings: { ...state.grassSettings },
		bushSettings: { ...state.bushSettings },
		flowerSettings: { ...state.flowerSettings },
		treeSettings: { ...state.treeSettings }
	};
}

export function subscribeNatureUiState(listener: NatureUiListener): () => void {
	listeners.add(listener);
	listener(getNatureUiState());
	return () => listeners.delete(listener);
}

export function openNaturePanel(): void {
	if (state.open && !state.radialOpen) {
		return;
	}

	state = {
		...state,
		open: true,
		radialOpen: false,
		radialHoverPreset: null,
		activePreset: state.activePreset ?? 'grass'
	};
	emit();
}

export function closeNaturePanel(): void {
	if (!state.open) {
		return;
	}

	state = {
		...state,
		open: false
	};
	emit();
}

export function openNatureRadial(): void {
	if (state.radialOpen) {
		return;
	}

	state = {
		...state,
		open: false,
		radialOpen: true,
		radialHoverPreset: null,
		activePreset: state.activePreset ?? 'grass'
	};
	emit();
}

export function closeNatureRadial(): void {
	if (!state.radialOpen && state.radialHoverPreset === null) {
		return;
	}

	state = {
		...state,
		radialOpen: false,
		radialHoverPreset: null
	};
	emit();
}

export function setNatureRadialHoverPreset(preset: NaturePreset | null): void {
	if (!state.radialOpen || state.radialHoverPreset === preset) {
		return;
	}

	state = {
		...state,
		radialHoverPreset: preset
	};
	emit();
}

export function toggleNaturePanel(): void {
	if (state.open) {
		closeNaturePanel();
		return;
	}

	openNaturePanel();
}

export function setNaturePreset(preset: NaturePreset): void {
	if (state.activePreset === preset) {
		return;
	}

	state = {
		...state,
		activePreset: preset
	};
	emit();
}

export function syncNatureTool(activeTool: NatureActiveTool | null): void {
	const activePreset = activeTool ? getNaturePresetForTool(activeTool) : state.activePreset;

	if (state.activeTool === activeTool && state.activePreset === activePreset) {
		return;
	}

	state = {
		...state,
		activeTool,
		activePreset
	};
	emit();
}

export function activateNaturePreset(preset: NaturePreset): void {
	const activeTool = getNatureToolForPreset(preset);

	state = {
		...state,
		open: false,
		radialOpen: false,
		radialHoverPreset: null,
		activePreset: preset,
		activeTool
	};
	emit();
}

export function clearNatureTool(): void {
	if (state.activeTool === null) {
		return;
	}

	state = {
		...state,
		activeTool: null
	};
	emit();
}

export function updateNatureGrassSettings(input: Partial<NatureGrassSettings>): void {
	const nextSettings: NatureGrassSettings = {
		...state.grassSettings,
		...input,
		radius: clampInteger(input.radius ?? state.grassSettings.radius, 1, 10),
		density: clampFloat(input.density ?? state.grassSettings.density, 0.05, 1),
		seedOffset: clampInteger(input.seedOffset ?? state.grassSettings.seedOffset, 0, 9999)
	};

	if (areGrassSettingsEqual(state.grassSettings, nextSettings)) {
		return;
	}

	state = {
		...state,
		grassSettings: nextSettings
	};
	emit();
}

export function updateNatureBushSettings(input: Partial<NatureBushSettings>): void {
	const nextSettings: NatureBushSettings = {
		...state.bushSettings,
		...input,
		size: isBushSize(input.size) ? input.size : state.bushSettings.size,
		density: isBushDensity(input.density) ? input.density : state.bushSettings.density,
		seedOffset: clampInteger(input.seedOffset ?? state.bushSettings.seedOffset, 0, 9999)
	};

	if (areBushSettingsEqual(state.bushSettings, nextSettings)) {
		return;
	}

	state = {
		...state,
		bushSettings: nextSettings
	};
	emit();
}

export function updateNatureTreeSettings(input: Partial<NatureTreeSettings>): void {
	const nextSettings: NatureTreeSettings = {
		...state.treeSettings,
		...input,
		seedOffset: clampInteger(input.seedOffset ?? state.treeSettings.seedOffset, 0, 9999)
	};

	if (areTreeSettingsEqual(state.treeSettings, nextSettings)) {
		return;
	}

	state = {
		...state,
		treeSettings: nextSettings
	};
	emit();
}

export function updateNatureFlowerSettings(input: Partial<NatureFlowerSettings>): void {
	const nextSettings: NatureFlowerSettings = {
		...state.flowerSettings,
		...input,
		radius: clampInteger(input.radius ?? state.flowerSettings.radius, 1, 10),
		density: clampFloat(input.density ?? state.flowerSettings.density, 0.05, 1),
		seedOffset: clampInteger(input.seedOffset ?? state.flowerSettings.seedOffset, 0, 9999),
		blossomColor: isFlowerColorMode(input.blossomColor)
			? (input.blossomColor ?? state.flowerSettings.blossomColor)
			: state.flowerSettings.blossomColor
	};

	if (areFlowerSettingsEqual(state.flowerSettings, nextSettings)) {
		return;
	}

	state = {
		...state,
		flowerSettings: nextSettings
	};
	emit();
}

function emit(): void {
	const snapshot = getNatureUiState();

	for (const listener of listeners) {
		listener(snapshot);
	}
}

function clampInteger(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function areGrassSettingsEqual(a: NatureGrassSettings, b: NatureGrassSettings): boolean {
	return (
		a.radius === b.radius &&
		a.density === b.density &&
		a.heightVariance === b.heightVariance &&
		a.seedOffset === b.seedOffset
	);
}

function areBushSettingsEqual(a: NatureBushSettings, b: NatureBushSettings): boolean {
	return a.size === b.size && a.density === b.density && a.seedOffset === b.seedOffset;
}

function areTreeSettingsEqual(a: NatureTreeSettings, b: NatureTreeSettings): boolean {
	return a.size === b.size && a.seedOffset === b.seedOffset;
}

function areFlowerSettingsEqual(a: NatureFlowerSettings, b: NatureFlowerSettings): boolean {
	return (
		a.radius === b.radius &&
		a.density === b.density &&
		a.seedOffset === b.seedOffset &&
		a.blossomColor === b.blossomColor
	);
}

function isFlowerColorMode(value: NatureFlowerSettings['blossomColor'] | undefined): boolean {
	return (
		value === 'random' ||
		value === 'scarlet' ||
		value === 'cobalt' ||
		value === 'amber' ||
		value === 'violet'
	);
}

function isBushSize(
	value: NatureBushSettings['size'] | undefined
): value is NatureBushSettings['size'] {
	return value === 'small' || value === 'medium' || value === 'large';
}

function isBushDensity(
	value: NatureBushSettings['density'] | undefined
): value is NatureBushSettings['density'] {
	return value === 'sparse' || value === 'balanced' || value === 'lush';
}
