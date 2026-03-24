import type { VoxelId, WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';
import {
	createSerializedVoxelPaletteState,
	getDefaultSerializedVoxelPaletteState,
	normalizeSerializedVoxelPaletteState,
	type SerializedVoxelPaletteState
} from '$lib/voxel/voxelPalette';
import {
	createSerializedPropLibraryState,
	normalizeSerializedPropLibraryState,
	type SerializedPropDefinition,
	type SerializedPropLibraryState
} from '$lib/voxel/propLibrary';
import type { SerializedWorldBlock, SerializedWorldPropInstance } from '$lib/voxel/world';

const WORLD_SNAPSHOT_VERSION = 5;
const DEV_WORLD_STORAGE_KEY = 'voxel-fun:dev-world:v1';

export type SerializedVoxelBlock = SerializedWorldBlock;

export type SerializedVoxelPropInstance = SerializedWorldPropInstance;

interface SerializedVoxelWorldV1 {
	version: 1;
	savedAt: string;
	blocks: Array<{
		materialId: VoxelId;
		origin: WorldCoord;
		size: number;
	}>;
}

interface SerializedVoxelWorldV2 {
	version: 2;
	savedAt: string;
	blocks: SerializedVoxelBlock[];
	materials: SerializedVoxelPaletteState['materials'];
	hotbar: SerializedVoxelPaletteState['hotbar'];
}

interface SerializedVoxelWorldV3 {
	version: 3;
	savedAt: string;
	blocks: SerializedVoxelBlock[];
	materials: SerializedVoxelPaletteState['materials'];
	hotbar: SerializedVoxelPaletteState['hotbar'];
	props: SerializedPropDefinition[];
	propInstances: SerializedVoxelPropInstance[];
}

interface SerializedVoxelWorldV4 {
	version: 4;
	savedAt: string;
	blocks: SerializedVoxelBlock[];
	materials: SerializedVoxelPaletteState['materials'];
	hotbar: SerializedVoxelPaletteState['hotbar'];
	props: SerializedPropDefinition[];
	propInstances: SerializedVoxelPropInstance[];
}

export interface SerializedVoxelWorld {
	version: typeof WORLD_SNAPSHOT_VERSION;
	savedAt: string;
	blocks: SerializedVoxelBlock[];
	materials: SerializedVoxelPaletteState['materials'];
	hotbar: SerializedVoxelPaletteState['hotbar'];
	props: SerializedPropDefinition[];
	propInstances: SerializedVoxelPropInstance[];
}

export function createSerializedWorld(world: VoxelWorld): SerializedVoxelWorld {
	const paletteState = createSerializedVoxelPaletteState();
	const propLibraryState = createSerializedPropLibraryState();

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: new Date().toISOString(),
		blocks: world.getBlocks().sort(compareSerializedBlocks),
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: propLibraryState.props,
		propInstances: world.getPropInstances().sort(compareSerializedPropInstances)
	};
}

export function saveSerializedWorldToStorage(world: VoxelWorld): SerializedVoxelWorld | null {
	if (!isBrowser()) {
		return null;
	}

	const snapshot = createSerializedWorld(world);
	window.localStorage.setItem(DEV_WORLD_STORAGE_KEY, JSON.stringify(snapshot));
	return snapshot;
}

export function loadSerializedWorldFromStorage(): SerializedVoxelWorld | null {
	if (!isBrowser()) {
		return null;
	}

	const serialized = window.localStorage.getItem(DEV_WORLD_STORAGE_KEY);

	if (!serialized) {
		return null;
	}

	const snapshot = parseSerializedWorld(serialized);

	if (!snapshot) {
		clearSerializedWorldFromStorage();
	}

	return snapshot;
}

export function clearSerializedWorldFromStorage(): void {
	if (!isBrowser()) {
		return;
	}

	window.localStorage.removeItem(DEV_WORLD_STORAGE_KEY);
}

export async function exportSerializedWorldToDisk(world: VoxelWorld): Promise<boolean> {
	if (!isBrowser()) {
		return false;
	}

	const snapshot = createSerializedWorld(world);
	const json = JSON.stringify(snapshot, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = `voxel-fun-world-${createFileTimestamp(snapshot.savedAt)}.json`;
	link.click();

	window.setTimeout(() => URL.revokeObjectURL(url), 0);
	return true;
}

export async function importSerializedWorldFromDisk(): Promise<SerializedVoxelWorld | null> {
	const file = await pickSnapshotFile();

	if (!file) {
		return null;
	}

	return parseSerializedWorld(await file.text());
}

function parseSerializedWorld(json: string): SerializedVoxelWorld | null {
	let parsed: unknown;

	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	const candidate = parsed as {
		version?: unknown;
		savedAt?: unknown;
		blocks?: unknown;
		materials?: unknown;
		hotbar?: unknown;
		props?: unknown;
		propInstances?: unknown;
	};
	const savedAt =
		typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString();
	const blocks = normalizeSerializedBlocks(candidate.blocks);

	if (!blocks) {
		return null;
	}

	if (candidate.version === 1) {
		return migrateSerializedWorldV1({
			version: 1,
			savedAt,
			blocks: blocks.map((block) => ({
				materialId: block.materialId,
				origin: block.origin,
				size: block.size
			}))
		});
	}

	if (candidate.version === 2) {
		return migrateSerializedWorldV2({
			version: 2,
			savedAt,
			blocks,
			materials: candidate.materials as SerializedVoxelPaletteState['materials'],
			hotbar: candidate.hotbar as SerializedVoxelPaletteState['hotbar']
		});
	}

	if (candidate.version === 3) {
		return migrateSerializedWorldV3({
			version: 3,
			savedAt,
			blocks,
			materials: candidate.materials as SerializedVoxelPaletteState['materials'],
			hotbar: candidate.hotbar as SerializedVoxelPaletteState['hotbar'],
			props: (candidate.props as SerializedPropDefinition[] | undefined) ?? [],
			propInstances: (candidate.propInstances as SerializedVoxelPropInstance[] | undefined) ?? []
		});
	}

	if (candidate.version === 4) {
		return migrateSerializedWorldV4({
			version: 4,
			savedAt,
			blocks,
			materials: candidate.materials as SerializedVoxelPaletteState['materials'],
			hotbar: candidate.hotbar as SerializedVoxelPaletteState['hotbar'],
			props: (candidate.props as SerializedPropDefinition[] | undefined) ?? [],
			propInstances: (candidate.propInstances as SerializedVoxelPropInstance[] | undefined) ?? []
		});
	}

	if (candidate.version !== WORLD_SNAPSHOT_VERSION) {
		return null;
	}

	const paletteState = normalizeSerializedVoxelPaletteState({
		materials: candidate.materials,
		hotbar: candidate.hotbar
	});
	const propLibraryState = normalizeSerializedPropLibraryState({
		props: candidate.props
	});
	const propInstances = normalizeSerializedPropInstances(candidate.propInstances);

	if (
		!paletteState ||
		!propLibraryState ||
		!propInstances ||
		!allBlockMaterialsExist(blocks, paletteState) ||
		!allPropReferencesExist(blocks, propInstances, propLibraryState)
	) {
		return null;
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt,
		blocks,
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: propLibraryState.props,
		propInstances
	};
}

function migrateSerializedWorldV1(snapshot: SerializedVoxelWorldV1): SerializedVoxelWorld | null {
	const paletteState = getDefaultSerializedVoxelPaletteState();

	if (
		!allBlockMaterialsExist(
			snapshot.blocks.map((block) => ({
				...block,
				propInstanceId: null
			})),
			paletteState
		)
	) {
		return null;
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: snapshot.savedAt,
		blocks: snapshot.blocks.map((block) => ({
			materialId: block.materialId,
			origin: block.origin,
			size: block.size,
			propInstanceId: null
		})),
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: [],
		propInstances: []
	};
}

function migrateSerializedWorldV2(snapshot: SerializedVoxelWorldV2): SerializedVoxelWorld | null {
	const paletteState = normalizeSerializedVoxelPaletteState({
		materials: snapshot.materials,
		hotbar: snapshot.hotbar
	});

	if (!paletteState || !allBlockMaterialsExist(snapshot.blocks, paletteState)) {
		return null;
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: snapshot.savedAt,
		blocks: snapshot.blocks.map((block) => ({
			materialId: block.materialId,
			origin: { ...block.origin },
			size: block.size,
			propInstanceId: block.propInstanceId ?? null
		})),
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: [],
		propInstances: []
	};
}

function migrateSerializedWorldV3(snapshot: SerializedVoxelWorldV3): SerializedVoxelWorld | null {
	const paletteState = normalizeSerializedVoxelPaletteState({
		materials: snapshot.materials,
		hotbar: snapshot.hotbar
	});
	const propLibraryState = normalizeSerializedPropLibraryState({
		props: snapshot.props
	});
	const propInstances = normalizeSerializedPropInstances(snapshot.propInstances);

	if (
		!paletteState ||
		!propLibraryState ||
		!propInstances ||
		!allBlockMaterialsExist(snapshot.blocks, paletteState) ||
		!allPropReferencesExist(snapshot.blocks, propInstances, propLibraryState)
	) {
		return null;
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: snapshot.savedAt,
		blocks: snapshot.blocks.map((block) => ({
			materialId: block.materialId,
			origin: { ...block.origin },
			size: block.size,
			propInstanceId: block.propInstanceId ?? null
		})),
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: propLibraryState.props,
		propInstances
	};
}

function migrateSerializedWorldV4(snapshot: SerializedVoxelWorldV4): SerializedVoxelWorld | null {
	const paletteState = normalizeSerializedVoxelPaletteState({
		materials: snapshot.materials,
		hotbar: snapshot.hotbar
	});
	const propLibraryState = normalizeSerializedPropLibraryState({
		props: snapshot.props
	});
	const propInstances = normalizeSerializedPropInstances(snapshot.propInstances);

	if (
		!paletteState ||
		!propLibraryState ||
		!propInstances ||
		!allBlockMaterialsExist(snapshot.blocks, paletteState) ||
		!allPropReferencesExist(snapshot.blocks, propInstances, propLibraryState)
	) {
		return null;
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: snapshot.savedAt,
		blocks: snapshot.blocks.map((block) => ({
			materialId: block.materialId,
			origin: { ...block.origin },
			size: block.size,
			propInstanceId: block.propInstanceId ?? null
		})),
		materials: paletteState.materials,
		hotbar: paletteState.hotbar,
		props: propLibraryState.props,
		propInstances
	};
}

function normalizeSerializedBlocks(blocks: unknown): SerializedVoxelBlock[] | null {
	if (!Array.isArray(blocks)) {
		return null;
	}

	const normalizedBlocks: SerializedVoxelBlock[] = [];

	for (const block of blocks) {
		const normalizedBlock = normalizeSerializedBlock(block);

		if (!normalizedBlock) {
			return null;
		}

		normalizedBlocks.push(normalizedBlock);
	}

	return normalizedBlocks;
}

function normalizeSerializedBlock(block: unknown): SerializedVoxelBlock | null {
	if (!block || typeof block !== 'object') {
		return null;
	}

	const candidate = block as {
		materialId?: unknown;
		origin?: unknown;
		size?: unknown;
		propInstanceId?: unknown;
	};
	const origin = normalizeWorldCoord(candidate.origin);

	if (
		!isInteger(candidate.materialId) ||
		candidate.materialId < 1 ||
		!isInteger(candidate.size) ||
		candidate.size < 1 ||
		!origin
	) {
		return null;
	}

	if (
		candidate.propInstanceId !== undefined &&
		candidate.propInstanceId !== null &&
		(!isInteger(candidate.propInstanceId) || candidate.propInstanceId < 1)
	) {
		return null;
	}

	return {
		materialId: candidate.materialId,
		origin,
		size: candidate.size,
		propInstanceId: candidate.propInstanceId ?? null
	};
}

function normalizeSerializedPropInstances(value: unknown): SerializedVoxelPropInstance[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const propInstances: SerializedVoxelPropInstance[] = [];
	const seenIds = new Set<number>();

	for (const entry of value) {
		const propInstance = normalizeSerializedPropInstance(entry);

		if (!propInstance || seenIds.has(propInstance.id)) {
			return null;
		}

		seenIds.add(propInstance.id);
		propInstances.push(propInstance);
	}

	return propInstances;
}

function normalizeSerializedPropInstance(value: unknown): SerializedVoxelPropInstance | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		id?: unknown;
		propId?: unknown;
		origin?: unknown;
		rotationQuarterTurns?: unknown;
	};
	const origin = normalizeWorldCoord(candidate.origin);
	const rotation = normalizeRotationQuarterTurns(candidate.rotationQuarterTurns);

	if (
		!isInteger(candidate.id) ||
		candidate.id < 1 ||
		!isInteger(candidate.propId) ||
		candidate.propId < 1 ||
		!origin ||
		!rotation
	) {
		return null;
	}

	return {
		id: candidate.id,
		propId: candidate.propId,
		origin,
		rotationQuarterTurns: rotation
	};
}

function normalizeRotationQuarterTurns(value: unknown) {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const candidate = value as {
		x?: unknown;
		y?: unknown;
		z?: unknown;
	};

	if (!isInteger(candidate.x) || !isInteger(candidate.y) || !isInteger(candidate.z)) {
		return null;
	}

	return {
		x: candidate.x,
		y: candidate.y,
		z: candidate.z
	};
}

function normalizeWorldCoord(coord: unknown): WorldCoord | null {
	if (!coord || typeof coord !== 'object') {
		return null;
	}

	const candidate = coord as {
		x?: unknown;
		y?: unknown;
		z?: unknown;
	};

	if (!isInteger(candidate.x) || !isInteger(candidate.y) || !isInteger(candidate.z)) {
		return null;
	}

	return {
		x: candidate.x,
		y: candidate.y,
		z: candidate.z
	};
}

function compareSerializedBlocks(a: SerializedVoxelBlock, b: SerializedVoxelBlock): number {
	return (
		a.origin.z - b.origin.z ||
		a.origin.y - b.origin.y ||
		a.origin.x - b.origin.x ||
		a.size - b.size ||
		a.materialId - b.materialId ||
		(a.propInstanceId ?? 0) - (b.propInstanceId ?? 0)
	);
}

function compareSerializedPropInstances(
	a: SerializedVoxelPropInstance,
	b: SerializedVoxelPropInstance
): number {
	return a.id - b.id || a.propId - b.propId;
}

function allBlockMaterialsExist(
	blocks: ReadonlyArray<SerializedVoxelBlock>,
	paletteState: SerializedVoxelPaletteState
): boolean {
	const materialIds = new Set(paletteState.materials.map((material) => material.id));

	for (const block of blocks) {
		if (!materialIds.has(block.materialId)) {
			return false;
		}
	}

	return true;
}

function allPropReferencesExist(
	blocks: ReadonlyArray<SerializedVoxelBlock>,
	propInstances: ReadonlyArray<SerializedVoxelPropInstance>,
	propLibraryState: SerializedPropLibraryState
): boolean {
	const propIds = new Set(propLibraryState.props.map((prop) => prop.id));
	const propInstanceIds = new Set(propInstances.map((propInstance) => propInstance.id));

	for (const propInstance of propInstances) {
		if (!propIds.has(propInstance.propId)) {
			return false;
		}
	}

	for (const block of blocks) {
		if (block.propInstanceId !== null && !propInstanceIds.has(block.propInstanceId)) {
			return false;
		}
	}

	return true;
}

function createFileTimestamp(isoTimestamp: string): string {
	return isoTimestamp.replaceAll(':', '-').replaceAll('.', '-');
}

function isInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function pickSnapshotFile(): Promise<File | null> {
	if (!isBrowser()) {
		return null;
	}

	const pickerWindow = window as Window & {
		showOpenFilePicker?: (options?: {
			excludeAcceptAllOption?: boolean;
			multiple?: boolean;
			types?: Array<{ description?: string; accept: Record<string, string[]> }>;
		}) => Promise<Array<{ getFile(): Promise<File> }>>;
	};

	if (pickerWindow.showOpenFilePicker) {
		try {
			const [handle] = await pickerWindow.showOpenFilePicker({
				excludeAcceptAllOption: true,
				multiple: false,
				types: [
					{
						description: 'Voxel Fun World Snapshot',
						accept: { 'application/json': ['.json'] }
					}
				]
			});

			return handle ? await handle.getFile() : null;
		} catch {
			return null;
		}
	}

	return new Promise<File | null>((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		let settled = false;

		const settle = (file: File | null): void => {
			if (settled) {
				return;
			}

			settled = true;
			window.removeEventListener('focus', handleWindowFocus);
			input.remove();
			resolve(file);
		};

		const handleSelection = (): void => {
			settle(input.files?.[0] ?? null);
		};

		const handleWindowFocus = (): void => {
			window.setTimeout(() => {
				settle(input.files?.[0] ?? null);
			}, 0);
		};

		input.addEventListener('change', handleSelection, { once: true });
		window.addEventListener('focus', handleWindowFocus, { once: true });
		input.click();
	});
}
