import {
	createWorldBox,
	type PropDefinition,
	type PropDefinitionBlock,
	type PropId,
	type VoxelId,
	type WorldBox
} from '$lib/voxel/voxelTypes';

export interface SerializedPropDefinition {
	id: PropId;
	name: string;
	interactable: boolean;
	blocks: PropDefinitionBlock[];
	bounds: WorldBox;
}

export interface SerializedPropLibraryState {
	props: SerializedPropDefinition[];
}

export interface PropLibraryState {
	props: PropDefinition[];
}

type PropLibraryListener = (state: PropLibraryState) => void;

const listeners = new Set<PropLibraryListener>();

let propLibraryState: PropLibraryState = { props: [] };

export function subscribePropLibrary(listener: PropLibraryListener): () => void {
	listeners.add(listener);
	listener(getPropLibraryState());
	return () => listeners.delete(listener);
}

export function getPropLibraryState(): PropLibraryState {
	return {
		props: propLibraryState.props.map(clonePropDefinition)
	};
}

export function createSerializedPropLibraryState(): SerializedPropLibraryState {
	return {
		props: propLibraryState.props.map(cloneSerializedPropDefinition)
	};
}

export function normalizeSerializedPropLibraryState(
	value: unknown
): SerializedPropLibraryState | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as { props?: unknown };

	if (!Array.isArray(candidate.props)) {
		return null;
	}

	const props: SerializedPropDefinition[] = [];
	const seenIds = new Set<PropId>();

	for (const entry of candidate.props) {
		const normalizedEntry = normalizeSerializedPropDefinition(entry);

		if (!normalizedEntry || seenIds.has(normalizedEntry.id)) {
			return null;
		}

		seenIds.add(normalizedEntry.id);
		props.push(normalizedEntry);
	}

	return { props };
}

export function restoreSerializedPropLibraryState(state: SerializedPropLibraryState): boolean {
	const normalizedState = normalizeSerializedPropLibraryState(state);

	if (!normalizedState) {
		return false;
	}

	propLibraryState = {
		props: normalizedState.props.map(clonePropDefinition)
	};
	emitPropLibraryState();
	return true;
}

export function resetPropLibrary(): void {
	propLibraryState = { props: [] };
	emitPropLibraryState();
}

export function getPropDefinition(propId: PropId): PropDefinition | null {
	return propLibraryState.props.find((prop) => prop.id === propId) ?? null;
}

export function createPropDefinition(input: {
	name: string;
	interactable: boolean;
	blocks: ReadonlyArray<PropDefinitionBlock>;
}): PropDefinition | null {
	const name = input.name.trim();
	const blocks = normalizePropDefinitionBlocks(input.blocks);

	if (!name || !blocks) {
		return null;
	}

	const prop: PropDefinition = {
		id: getNextPropId(),
		name,
		interactable: input.interactable,
		blocks,
		bounds: computePropBounds(blocks)
	};

	propLibraryState = {
		props: [...propLibraryState.props, prop]
	};
	emitPropLibraryState();
	return clonePropDefinition(prop);
}

export function deletePropDefinition(propId: PropId): boolean {
	const nextProps = propLibraryState.props.filter((prop) => prop.id !== propId);

	if (nextProps.length === propLibraryState.props.length) {
		return false;
	}

	propLibraryState = { props: nextProps };
	emitPropLibraryState();
	return true;
}

export function getReferencedPropMaterialIds(): Set<VoxelId> {
	const materialIds = new Set<VoxelId>();

	for (const prop of propLibraryState.props) {
		for (const block of prop.blocks) {
			materialIds.add(block.materialId);
		}
	}

	return materialIds;
}

export function hasPropMaterialReference(materialId: VoxelId): boolean {
	for (const prop of propLibraryState.props) {
		for (const block of prop.blocks) {
			if (block.materialId === materialId) {
				return true;
			}
		}
	}

	return false;
}

function emitPropLibraryState(): void {
	const snapshot = getPropLibraryState();

	for (const listener of listeners) {
		listener(snapshot);
	}
}

function getNextPropId(): PropId {
	return propLibraryState.props.reduce((maxId, prop) => Math.max(maxId, prop.id), 0) + 1;
}

function normalizeSerializedPropDefinition(value: unknown): SerializedPropDefinition | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		id?: unknown;
		name?: unknown;
		interactable?: unknown;
		blocks?: unknown;
		bounds?: unknown;
	};
	const blocks = normalizePropDefinitionBlocks(candidate.blocks);
	const bounds = normalizeWorldBox(candidate.bounds);

	if (
		typeof candidate.id !== 'number' ||
		!Number.isInteger(candidate.id) ||
		candidate.id < 1 ||
		typeof candidate.name !== 'string' ||
		candidate.name.trim().length === 0 ||
		typeof candidate.interactable !== 'boolean' ||
		!blocks ||
		!bounds
	) {
		return null;
	}

	const computedBounds = computePropBounds(blocks);

	if (!areWorldBoxesEqual(bounds, computedBounds)) {
		return null;
	}

	return {
		id: candidate.id,
		name: candidate.name.trim(),
		interactable: candidate.interactable,
		blocks,
		bounds
	};
}

function normalizePropDefinitionBlocks(value: unknown): PropDefinitionBlock[] | null {
	if (!Array.isArray(value) || value.length === 0) {
		return null;
	}

	const blocks: PropDefinitionBlock[] = [];

	for (const entry of value) {
		const block = normalizePropDefinitionBlock(entry);

		if (!block) {
			return null;
		}

		blocks.push(block);
	}

	return blocks.sort(comparePropBlocks);
}

function normalizePropDefinitionBlock(value: unknown): PropDefinitionBlock | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		materialId?: unknown;
		origin?: unknown;
		size?: unknown;
	};

	if (
		typeof candidate.materialId !== 'number' ||
		!Number.isInteger(candidate.materialId) ||
		candidate.materialId < 1 ||
		typeof candidate.size !== 'number' ||
		!Number.isInteger(candidate.size) ||
		candidate.size < 1
	) {
		return null;
	}

	const origin = normalizeWorldCoord(candidate.origin);

	if (!origin) {
		return null;
	}

	return {
		materialId: candidate.materialId,
		origin,
		size: candidate.size
	};
}

function normalizeWorldBox(value: unknown): WorldBox | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as { min?: unknown; max?: unknown };
	const min = normalizeWorldCoord(candidate.min);
	const max = normalizeWorldCoord(candidate.max);

	if (!min || !max) {
		return null;
	}

	return createWorldBox(min, max);
}

function normalizeWorldCoord(value: unknown) {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as { x?: unknown; y?: unknown; z?: unknown };

	if (
		typeof candidate.x !== 'number' ||
		!Number.isInteger(candidate.x) ||
		typeof candidate.y !== 'number' ||
		!Number.isInteger(candidate.y) ||
		typeof candidate.z !== 'number' ||
		!Number.isInteger(candidate.z)
	) {
		return null;
	}

	return {
		x: candidate.x,
		y: candidate.y,
		z: candidate.z
	};
}

function computePropBounds(blocks: ReadonlyArray<PropDefinitionBlock>): WorldBox {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;

	for (const block of blocks) {
		minX = Math.min(minX, block.origin.x);
		minY = Math.min(minY, block.origin.y);
		minZ = Math.min(minZ, block.origin.z);
		maxX = Math.max(maxX, block.origin.x + block.size - 1);
		maxY = Math.max(maxY, block.origin.y + block.size - 1);
		maxZ = Math.max(maxZ, block.origin.z + block.size - 1);
	}

	return createWorldBox({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
}

function cloneSerializedPropDefinition(prop: PropDefinition): SerializedPropDefinition {
	return {
		id: prop.id,
		name: prop.name,
		interactable: prop.interactable,
		blocks: prop.blocks.map(clonePropDefinitionBlock),
		bounds: createWorldBox(prop.bounds.min, prop.bounds.max)
	};
}

function clonePropDefinition(prop: PropDefinition): PropDefinition {
	return {
		id: prop.id,
		name: prop.name,
		interactable: prop.interactable,
		blocks: prop.blocks.map(clonePropDefinitionBlock),
		bounds: createWorldBox(prop.bounds.min, prop.bounds.max)
	};
}

function clonePropDefinitionBlock(block: PropDefinitionBlock): PropDefinitionBlock {
	return {
		materialId: block.materialId,
		origin: { ...block.origin },
		size: block.size
	};
}

function comparePropBlocks(a: PropDefinitionBlock, b: PropDefinitionBlock): number {
	return (
		a.origin.z - b.origin.z ||
		a.origin.y - b.origin.y ||
		a.origin.x - b.origin.x ||
		a.size - b.size ||
		a.materialId - b.materialId
	);
}

function areWorldBoxesEqual(a: WorldBox, b: WorldBox): boolean {
	return (
		a.min.x === b.min.x &&
		a.min.y === b.min.y &&
		a.min.z === b.min.z &&
		a.max.x === b.max.x &&
		a.max.y === b.max.y &&
		a.max.z === b.max.z
	);
}
