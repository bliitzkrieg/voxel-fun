import type { VoxelId } from '$lib/voxel/voxelTypes';

export interface VoxelPaletteEntry {
	id: VoxelId;
	name: string;
	color: [number, number, number];
	opacity: number;
	isWater: boolean;
	emitsLight: boolean;
	lightTint: [number, number, number];
	archived: boolean;
}

export interface SerializedVoxelPaletteEntry {
	id: VoxelId;
	name: string;
	color: [number, number, number];
	opacity: number;
	isWater?: boolean;
	emitsLight?: boolean;
	lightTint?: [number, number, number];
	archived?: boolean;
}

export interface SerializedVoxelPaletteState {
	materials: SerializedVoxelPaletteEntry[];
	hotbar: Array<VoxelId | null>;
}

export interface VoxelPaletteState {
	materials: VoxelPaletteEntry[];
	hotbar: Array<VoxelId | null>;
}

type PaletteListener = (state: VoxelPaletteState) => void;

export const HOTBAR_SLOT_COUNT = 9;

export const VOXEL_CONCRETE = 1;
export const VOXEL_BRICK = 2;
export const VOXEL_PAINTED_WALL = 3;
export const VOXEL_DARK_TRIM = 4;
export const VOXEL_METAL = 5;
export const VOXEL_ASPHALT = 6;
export const VOXEL_TILE = 7;
export const VOXEL_GLASS = 8;
export const VOXEL_ROOF = 9;

export const DEFAULT_SELECTED_VOXEL_ID = VOXEL_CONCRETE;

const DEFAULT_MATERIALS: SerializedVoxelPaletteEntry[] = [
	{
		id: VOXEL_CONCRETE,
		name: 'Concrete',
		color: [0.62, 0.62, 0.6],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.62, 0.62, 0.6]
	},
	{
		id: VOXEL_BRICK,
		name: 'Brick',
		color: [0.55, 0.24, 0.2],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.55, 0.24, 0.2]
	},
	{
		id: VOXEL_PAINTED_WALL,
		name: 'Painted Wall',
		color: [0.8, 0.78, 0.72],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.8, 0.78, 0.72]
	},
	{
		id: VOXEL_DARK_TRIM,
		name: 'Dark Trim',
		color: [0.16, 0.18, 0.2],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.16, 0.18, 0.2]
	},
	{
		id: VOXEL_METAL,
		name: 'Metal',
		color: [0.48, 0.5, 0.55],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.48, 0.5, 0.55]
	},
	{
		id: VOXEL_ASPHALT,
		name: 'Asphalt',
		color: [0.18, 0.19, 0.21],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.18, 0.19, 0.21]
	},
	{
		id: VOXEL_TILE,
		name: 'Tile',
		color: [0.69, 0.7, 0.73],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.69, 0.7, 0.73]
	},
	{
		id: VOXEL_GLASS,
		name: 'Glass',
		color: [0.58, 0.72, 0.78],
		opacity: 0.38,
		isWater: false,
		emitsLight: false,
		lightTint: [0.58, 0.72, 0.78]
	},
	{
		id: VOXEL_ROOF,
		name: 'Roof',
		color: [0.33, 0.22, 0.18],
		opacity: 1,
		isWater: false,
		emitsLight: false,
		lightTint: [0.33, 0.22, 0.18]
	}
];

const listeners = new Set<PaletteListener>();

let paletteState: VoxelPaletteState = createDefaultPaletteState();

export function subscribeVoxelPalette(listener: PaletteListener): () => void {
	listeners.add(listener);
	listener(getVoxelPaletteState());
	return () => listeners.delete(listener);
}

export function getVoxelPaletteState(): VoxelPaletteState {
	return {
		materials: paletteState.materials.map(clonePaletteEntry),
		hotbar: [...paletteState.hotbar]
	};
}

export function createSerializedVoxelPaletteState(): SerializedVoxelPaletteState {
	return {
		materials: paletteState.materials.map((entry) => ({
			id: entry.id,
			name: entry.name,
			color: [...entry.color] as [number, number, number],
			opacity: entry.opacity,
			isWater: entry.isWater,
			emitsLight: entry.emitsLight,
			lightTint: [...entry.lightTint] as [number, number, number],
			archived: entry.archived
		})),
		hotbar: [...paletteState.hotbar]
	};
}

export function getDefaultSerializedVoxelPaletteState(): SerializedVoxelPaletteState {
	return {
		materials: DEFAULT_MATERIALS.map((entry) => ({
			id: entry.id,
			name: entry.name,
			color: [...entry.color] as [number, number, number],
			opacity: entry.opacity,
			isWater: entry.isWater ?? false,
			emitsLight: entry.emitsLight ?? false,
			lightTint: [...(entry.lightTint ?? entry.color)] as [number, number, number],
			archived: false
		})),
		hotbar: createDefaultHotbar()
	};
}

export function normalizeSerializedVoxelPaletteState(
	value: unknown
): SerializedVoxelPaletteState | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		materials?: unknown;
		hotbar?: unknown;
	};

	if (!Array.isArray(candidate.materials) || !Array.isArray(candidate.hotbar)) {
		return null;
	}

	const normalizedMaterials: SerializedVoxelPaletteEntry[] = [];
	const seenIds = new Set<VoxelId>();

	for (const entry of candidate.materials) {
		const normalizedEntry = normalizeSerializedPaletteEntry(entry);

		if (!normalizedEntry || seenIds.has(normalizedEntry.id)) {
			return null;
		}

		seenIds.add(normalizedEntry.id);
		normalizedMaterials.push(normalizedEntry);
	}

	if (candidate.hotbar.length !== HOTBAR_SLOT_COUNT) {
		return null;
	}

	const normalizedHotbar: Array<VoxelId | null> = [];

	for (const slot of candidate.hotbar) {
		const normalizedSlot = normalizeHotbarSlot(slot, seenIds);

		if (normalizedSlot === undefined) {
			return null;
		}

		normalizedHotbar.push(normalizedSlot);
	}

	for (const materialId of normalizedHotbar) {
		if (materialId === null) {
			continue;
		}

		const material = normalizedMaterials.find((entry) => entry.id === materialId);

		if (!material || material.archived) {
			return null;
		}
	}

	return {
		materials: normalizedMaterials,
		hotbar: normalizedHotbar
	};
}

export function restoreSerializedVoxelPaletteState(state: SerializedVoxelPaletteState): boolean {
	const normalizedState = normalizeSerializedVoxelPaletteState(state);

	if (!normalizedState) {
		return false;
	}

	paletteState = {
		materials: normalizedState.materials.map((entry) => ({
			id: entry.id,
			name: entry.name,
			color: [...entry.color] as [number, number, number],
			opacity: entry.opacity,
			isWater: entry.isWater ?? false,
			emitsLight: entry.emitsLight ?? false,
			lightTint: [...(entry.lightTint ?? entry.color)] as [number, number, number],
			archived: entry.archived ?? false
		})),
		hotbar: [...normalizedState.hotbar]
	};

	emitPaletteState();
	return true;
}

export function resetVoxelPaletteToDefaults(): void {
	restoreSerializedVoxelPaletteState(getDefaultSerializedVoxelPaletteState());
}

export function getVoxelPaletteEntry(id: VoxelId): VoxelPaletteEntry | null {
	return paletteState.materials.find((entry) => entry.id === id) ?? null;
}

export function getVisibleVoxelPaletteEntries(): VoxelPaletteEntry[] {
	return paletteState.materials.filter((entry) => !entry.archived).map(clonePaletteEntry);
}

export function getHotbarMaterialIds(): Array<VoxelId | null> {
	return [...paletteState.hotbar];
}

export function getHotbarMaterialId(slotIndex: number): VoxelId | null {
	return paletteState.hotbar[slotIndex] ?? null;
}

export function getVoxelColor(id: VoxelId): [number, number, number] {
	return getVoxelPaletteEntry(id)?.color ?? [1, 0, 1];
}

export function getVoxelOpacity(id: VoxelId): number {
	return getVoxelPaletteEntry(id)?.opacity ?? 1;
}

export function isWaterVoxelMaterial(id: VoxelId): boolean {
	return getVoxelPaletteEntry(id)?.isWater ?? false;
}

export function isSolidVoxelMaterial(id: VoxelId): boolean {
	return id > 0 && !isWaterVoxelMaterial(id);
}

export function getVoxelLightTint(id: VoxelId): [number, number, number] {
	const entry = getVoxelPaletteEntry(id);
	return entry ? [...entry.lightTint] : [1, 0.85, 0.4];
}

export function doesVoxelEmitLight(id: VoxelId): boolean {
	return getVoxelPaletteEntry(id)?.emitsLight ?? false;
}

export function isSelectableVoxelMaterial(id: VoxelId): boolean {
	const entry = getVoxelPaletteEntry(id);
	return !!entry && !entry.archived;
}

export function getFirstSelectableVoxelMaterialId(): VoxelId | null {
	return paletteState.materials.find((entry) => !entry.archived)?.id ?? null;
}

export function getFirstSelectableHotbarMaterialId(): VoxelId | null {
	for (const materialId of paletteState.hotbar) {
		if (materialId !== null && isSelectableVoxelMaterial(materialId)) {
			return materialId;
		}
	}

	return null;
}

export function assignMaterialToHotbar(slotIndex: number, materialId: VoxelId | null): boolean {
	if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= HOTBAR_SLOT_COUNT) {
		return false;
	}

	if (materialId !== null && !isSelectableVoxelMaterial(materialId)) {
		return false;
	}

	let changed = false;
	const nextHotbar = [...paletteState.hotbar];

	if (materialId !== null) {
		for (let index = 0; index < nextHotbar.length; index += 1) {
			if (nextHotbar[index] === materialId) {
				nextHotbar[index] = null;
				changed = true;
			}
		}
	}

	if (nextHotbar[slotIndex] !== materialId) {
		nextHotbar[slotIndex] = materialId;
		changed = true;
	}

	if (!changed) {
		return false;
	}

	paletteState = {
		...paletteState,
		hotbar: nextHotbar
	};
	emitPaletteState();
	return true;
}

export function createVoxelMaterial(input: {
	name: string;
	color: [number, number, number];
	opacity: number;
	isWater?: boolean;
	emitsLight?: boolean;
	lightTint?: [number, number, number];
}): VoxelPaletteEntry | null {
	const name = input.name.trim();
	const color = normalizeColorTuple(input.color);
	const opacity = normalizeOpacity(input.opacity);
	const isWater = input.isWater ?? false;
	const emitsLight = input.emitsLight ?? false;
	const lightTint = normalizeColorTuple(input.lightTint ?? input.color);

	if (!name || !color || opacity === null || !lightTint) {
		return null;
	}

	const nextId = getNextMaterialId();
	const material: VoxelPaletteEntry = {
		id: nextId,
		name,
		color,
		opacity,
		isWater,
		emitsLight,
		lightTint,
		archived: false
	};
	const nextHotbar = [...paletteState.hotbar];
	const firstEmptySlot = nextHotbar.findIndex((slot) => slot === null);

	if (firstEmptySlot >= 0) {
		nextHotbar[firstEmptySlot] = material.id;
	}

	paletteState = {
		materials: [...paletteState.materials, material],
		hotbar: nextHotbar
	};
	emitPaletteState();
	return clonePaletteEntry(material);
}

export function updateVoxelMaterialLighting(
	materialId: VoxelId,
	input: {
		emitsLight: boolean;
		lightTint: [number, number, number];
	}
): VoxelPaletteEntry | null {
	const materialIndex = paletteState.materials.findIndex((entry) => entry.id === materialId);

	if (materialIndex < 0) {
		return null;
	}

	const material = paletteState.materials[materialIndex];
	const lightTint = normalizeColorTuple(input.lightTint);

	if (!material || !lightTint) {
		return null;
	}

	if (material.emitsLight === input.emitsLight && areColorsEqual(material.lightTint, lightTint)) {
		return clonePaletteEntry(material);
	}

	const nextMaterial: VoxelPaletteEntry = {
		...material,
		emitsLight: input.emitsLight,
		lightTint
	};

	paletteState = {
		...paletteState,
		materials: paletteState.materials.map((entry, index) =>
			index === materialIndex ? nextMaterial : entry
		)
	};
	emitPaletteState();
	return clonePaletteEntry(nextMaterial);
}

export function updateVoxelMaterialWater(
	materialId: VoxelId,
	input: {
		isWater: boolean;
	}
): VoxelPaletteEntry | null {
	const materialIndex = paletteState.materials.findIndex((entry) => entry.id === materialId);

	if (materialIndex < 0) {
		return null;
	}

	const material = paletteState.materials[materialIndex];

	if (!material) {
		return null;
	}

	if (material.isWater === input.isWater) {
		return clonePaletteEntry(material);
	}

	const nextMaterial: VoxelPaletteEntry = {
		...material,
		isWater: input.isWater
	};

	paletteState = {
		...paletteState,
		materials: paletteState.materials.map((entry, index) =>
			index === materialIndex ? nextMaterial : entry
		)
	};
	emitPaletteState();
	return clonePaletteEntry(nextMaterial);
}

export function deleteVoxelMaterial(
	materialId: VoxelId,
	isReferenced: boolean
): { deleted: boolean; archived: boolean } {
	const materialIndex = paletteState.materials.findIndex((entry) => entry.id === materialId);

	if (materialIndex < 0) {
		return { deleted: false, archived: false };
	}

	const material = paletteState.materials[materialIndex];

	if (!material) {
		return { deleted: false, archived: false };
	}

	let nextMaterials = [...paletteState.materials];
	const nextHotbar = paletteState.hotbar.map((slot) => (slot === materialId ? null : slot));

	if (isReferenced) {
		if (material.archived) {
			return { deleted: false, archived: true };
		}

		nextMaterials[materialIndex] = { ...material, archived: true };
		paletteState = {
			materials: nextMaterials,
			hotbar: nextHotbar
		};
		emitPaletteState();
		return { deleted: true, archived: true };
	}

	nextMaterials = nextMaterials.filter((entry) => entry.id !== materialId);
	paletteState = {
		materials: nextMaterials,
		hotbar: nextHotbar
	};
	emitPaletteState();
	return { deleted: true, archived: false };
}

export function pruneUnusedArchivedVoxelMaterials(
	referencedMaterialIds: Iterable<VoxelId>
): boolean {
	const referencedIds = new Set(referencedMaterialIds);
	const nextMaterials = paletteState.materials.filter(
		(entry) => !entry.archived || referencedIds.has(entry.id)
	);

	if (nextMaterials.length === paletteState.materials.length) {
		return false;
	}

	paletteState = {
		materials: nextMaterials,
		hotbar: [...paletteState.hotbar]
	};
	emitPaletteState();
	return true;
}

function createDefaultPaletteState(): VoxelPaletteState {
	const defaults = getDefaultSerializedVoxelPaletteState();

	return {
		materials: defaults.materials.map((entry) => ({
			id: entry.id,
			name: entry.name,
			color: [...entry.color] as [number, number, number],
			opacity: entry.opacity,
			isWater: entry.isWater ?? false,
			emitsLight: entry.emitsLight ?? false,
			lightTint: [...(entry.lightTint ?? entry.color)] as [number, number, number],
			archived: false
		})),
		hotbar: [...defaults.hotbar]
	};
}

function createDefaultHotbar(): Array<VoxelId | null> {
	return Array.from(
		{ length: HOTBAR_SLOT_COUNT },
		(_, index) => DEFAULT_MATERIALS[index]?.id ?? null
	);
}

function getNextMaterialId(): VoxelId {
	return paletteState.materials.reduce((maxId, entry) => Math.max(maxId, entry.id), 0) + 1;
}

function emitPaletteState(): void {
	const snapshot = getVoxelPaletteState();

	for (const listener of listeners) {
		listener(snapshot);
	}
}

function clonePaletteEntry(entry: VoxelPaletteEntry): VoxelPaletteEntry {
	return {
		id: entry.id,
		name: entry.name,
		color: [...entry.color] as [number, number, number],
		opacity: entry.opacity,
		isWater: entry.isWater,
		emitsLight: entry.emitsLight,
		lightTint: [...entry.lightTint] as [number, number, number],
		archived: entry.archived
	};
}

function normalizeSerializedPaletteEntry(value: unknown): SerializedVoxelPaletteEntry | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		id?: unknown;
		name?: unknown;
		color?: unknown;
		opacity?: unknown;
		isWater?: unknown;
		emitsLight?: unknown;
		lightTint?: unknown;
		archived?: unknown;
	};
	const color = normalizeColorTuple(candidate.color);
	const opacity = normalizeOpacity(candidate.opacity);
	const isWater = candidate.isWater ?? false;
	const emitsLight = candidate.emitsLight ?? false;
	const lightTint = normalizeColorTuple(candidate.lightTint ?? candidate.color);

	if (
		typeof candidate.id !== 'number' ||
		!Number.isInteger(candidate.id) ||
		candidate.id < 1 ||
		typeof candidate.name !== 'string' ||
		candidate.name.trim().length === 0 ||
		!color ||
		opacity === null ||
		typeof isWater !== 'boolean' ||
		typeof emitsLight !== 'boolean' ||
		!lightTint ||
		(candidate.archived !== undefined && typeof candidate.archived !== 'boolean')
	) {
		return null;
	}

	return {
		id: candidate.id as VoxelId,
		name: candidate.name.trim(),
		color,
		opacity,
		isWater,
		emitsLight,
		lightTint,
		archived: candidate.archived ?? false
	};
}

function normalizeColorTuple(value: unknown): [number, number, number] | null {
	if (!Array.isArray(value) || value.length !== 3) {
		return null;
	}

	const components = value.map((component) =>
		typeof component === 'number' && Number.isFinite(component) ? component : NaN
	);

	if (components.some((component) => component < 0 || component > 1 || Number.isNaN(component))) {
		return null;
	}

	return [components[0]!, components[1]!, components[2]!];
}

function normalizeOpacity(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
		? value
		: null;
}

function normalizeHotbarSlot(
	value: unknown,
	validMaterialIds: ReadonlySet<VoxelId>
): VoxelId | null | undefined {
	if (value === null) {
		return null;
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		return undefined;
	}

	if (!validMaterialIds.has(value)) {
		return undefined;
	}

	return value;
}

function areColorsEqual(a: [number, number, number], b: [number, number, number]): boolean {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
