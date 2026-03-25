import {
	DEFAULT_NATURE_GRASS_SETTINGS,
	DEFAULT_NATURE_TREE_SETTINGS,
	getNaturePresetForTool,
	getNatureToolForPreset,
	type NatureActiveTool,
	type NatureGrassSettings,
	type NaturePreset,
	type NatureTreeSettings
} from '$lib/nature/natureTypes';

export interface NatureUiState {
	open: boolean;
	activePreset: NaturePreset | null;
	activeTool: NatureActiveTool | null;
	grassSettings: NatureGrassSettings;
	treeSettings: NatureTreeSettings;
}

type NatureUiListener = (state: NatureUiState) => void;

const listeners = new Set<NatureUiListener>();

let state: NatureUiState = {
	open: false,
	activePreset: 'grass',
	activeTool: null,
	grassSettings: { ...DEFAULT_NATURE_GRASS_SETTINGS },
	treeSettings: { ...DEFAULT_NATURE_TREE_SETTINGS }
};

export function getNatureUiState(): NatureUiState {
	return {
		open: state.open,
		activePreset: state.activePreset,
		activeTool: state.activeTool,
		grassSettings: { ...state.grassSettings },
		treeSettings: { ...state.treeSettings }
	};
}

export function subscribeNatureUiState(listener: NatureUiListener): () => void {
	listeners.add(listener);
	listener(getNatureUiState());
	return () => listeners.delete(listener);
}

export function openNaturePanel(): void {
	if (state.open) {
		return;
	}

	state = {
		...state,
		open: true,
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

function areTreeSettingsEqual(a: NatureTreeSettings, b: NatureTreeSettings): boolean {
	return a.size === b.size && a.seedOffset === b.seedOffset;
}
