import type { PropId } from '$lib/voxel/voxelTypes';

export interface PropUiState {
	managerOpen: boolean;
	placementActive: boolean;
	placementPropId: PropId | null;
	placementPropName: string | null;
	transformMode: 'translate' | 'rotate';
}

type PropUiListener = (state: PropUiState) => void;

const listeners = new Set<PropUiListener>();

let state: PropUiState = {
	managerOpen: false,
	placementActive: false,
	placementPropId: null,
	placementPropName: null,
	transformMode: 'translate'
};

export function getPropUiState(): PropUiState {
	return { ...state };
}

export function subscribePropUiState(listener: PropUiListener): () => void {
	listeners.add(listener);
	listener(getPropUiState());
	return () => listeners.delete(listener);
}

export function openPropManager(): void {
	if (state.managerOpen && !state.placementActive) {
		return;
	}

	state = {
		managerOpen: true,
		placementActive: false,
		placementPropId: null,
		placementPropName: null,
		transformMode: 'translate'
	};
	emit();
}

export function closePropManager(): void {
	if (!state.managerOpen) {
		return;
	}

	state = {
		...state,
		managerOpen: false
	};
	emit();
}

export function togglePropManager(): void {
	if (state.managerOpen) {
		closePropManager();
		return;
	}

	openPropManager();
}

export function startPropPlacement(propId: PropId, propName: string): void {
	state = {
		managerOpen: false,
		placementActive: true,
		placementPropId: propId,
		placementPropName: propName,
		transformMode: 'translate'
	};
	emit();
}

export function setPropPlacementTransformMode(mode: 'translate' | 'rotate'): void {
	if (state.transformMode === mode) {
		return;
	}

	state = {
		...state,
		transformMode: mode
	};
	emit();
}

export function clearPropPlacement(): void {
	if (
		!state.placementActive &&
		state.placementPropId === null &&
		state.placementPropName === null
	) {
		return;
	}

	state = {
		...state,
		placementActive: false,
		placementPropId: null,
		placementPropName: null,
		transformMode: 'translate'
	};
	emit();
}

function emit(): void {
	const snapshot = getPropUiState();

	for (const listener of listeners) {
		listener(snapshot);
	}
}
