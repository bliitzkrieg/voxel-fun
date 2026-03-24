import type { VoxelBlock, VoxelId, WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const WORLD_SNAPSHOT_VERSION = 1;
const DEV_WORLD_STORAGE_KEY = 'voxel-fun:dev-world:v1';

export interface SerializedVoxelBlock {
	materialId: VoxelId;
	origin: WorldCoord;
	size: number;
}

export interface SerializedVoxelWorld {
	version: typeof WORLD_SNAPSHOT_VERSION;
	savedAt: string;
	blocks: SerializedVoxelBlock[];
}

export function createSerializedWorld(world: VoxelWorld): SerializedVoxelWorld {
	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: new Date().toISOString(),
		blocks: world
			.getBlocks()
			.sort(compareSerializedBlocks)
			.map((block) => ({
				materialId: block.materialId,
				origin: { ...block.origin },
				size: block.size
			}))
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
	};

	if (candidate.version !== WORLD_SNAPSHOT_VERSION || !Array.isArray(candidate.blocks)) {
		return null;
	}

	const blocks: SerializedVoxelBlock[] = [];

	for (const block of candidate.blocks) {
		const normalizedBlock = normalizeSerializedBlock(block);

		if (!normalizedBlock) {
			return null;
		}

		blocks.push(normalizedBlock);
	}

	return {
		version: WORLD_SNAPSHOT_VERSION,
		savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : new Date().toISOString(),
		blocks
	};
}

function normalizeSerializedBlock(block: unknown): SerializedVoxelBlock | null {
	if (!block || typeof block !== 'object') {
		return null;
	}

	const candidate = block as {
		materialId?: unknown;
		origin?: unknown;
		size?: unknown;
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

	return {
		materialId: candidate.materialId,
		origin,
		size: candidate.size
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

function compareSerializedBlocks(
	a: Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>,
	b: Pick<VoxelBlock, 'materialId' | 'origin' | 'size'>
): number {
	return (
		a.origin.z - b.origin.z ||
		a.origin.y - b.origin.y ||
		a.origin.x - b.origin.x ||
		a.size - b.size ||
		a.materialId - b.materialId
	);
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
