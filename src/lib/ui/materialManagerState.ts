export interface MaterialManagerUiState {
	open: boolean;
	assignmentSlotIndex: number | null;
}

type MaterialManagerListener = (state: MaterialManagerUiState) => void;

const listeners = new Set<MaterialManagerListener>();

let state: MaterialManagerUiState = {
	open: false,
	assignmentSlotIndex: null
};

export function getMaterialManagerUiState(): MaterialManagerUiState {
	return { ...state };
}

export function subscribeMaterialManagerUiState(listener: MaterialManagerListener): () => void {
	listeners.add(listener);
	listener(getMaterialManagerUiState());
	return () => listeners.delete(listener);
}

export function openMaterialManager(): void {
	if (state.open) {
		return;
	}

	state = {
		open: true,
		assignmentSlotIndex: null
	};
	emit();
}

export function closeMaterialManager(): void {
	if (!state.open && state.assignmentSlotIndex === null) {
		return;
	}

	state = {
		open: false,
		assignmentSlotIndex: null
	};
	emit();
}

export function toggleMaterialManager(): void {
	if (state.open) {
		closeMaterialManager();
		return;
	}

	openMaterialManager();
}

export function setMaterialManagerAssignmentSlot(slotIndex: number | null): void {
	if (state.assignmentSlotIndex === slotIndex) {
		return;
	}

	state = {
		...state,
		assignmentSlotIndex: slotIndex
	};
	emit();
}

function emit(): void {
	const snapshot = getMaterialManagerUiState();

	for (const listener of listeners) {
		listener(snapshot);
	}
}
