import {
	ensureVoxelMaterial,
	getNatureMaterialIds,
	type VoxelPaletteEntry
} from '$lib/voxel/voxelPalette';

import type { NatureRole } from '$lib/nature/natureTypes';

interface NatureMaterialDefinition {
	name: string;
	color: [number, number, number];
	natureRole: NatureRole;
}

interface NatureMaterialSet {
	grass: NatureMaterialDefinition[];
	leaf: NatureMaterialDefinition[];
	bark: NatureMaterialDefinition[];
}

const NATURE_MATERIALS: NatureMaterialSet = {
	grass: [
		{ name: 'Nature Grass Olive', color: [0.3, 0.41, 0.18], natureRole: 'grass' },
		{ name: 'Nature Grass Moss', color: [0.23, 0.33, 0.14], natureRole: 'grass' },
		{ name: 'Nature Grass Sage', color: [0.38, 0.5, 0.24], natureRole: 'grass' },
		{ name: 'Nature Grass Bright', color: [0.47, 0.61, 0.3], natureRole: 'grass' }
	],
	leaf: [
		{ name: 'Nature Leaf Deep', color: [0.18, 0.28, 0.11], natureRole: 'leaf' },
		{ name: 'Nature Leaf Mid', color: [0.24, 0.38, 0.16], natureRole: 'leaf' },
		{ name: 'Nature Leaf Soft', color: [0.32, 0.48, 0.22], natureRole: 'leaf' },
		{ name: 'Nature Leaf Sun', color: [0.41, 0.56, 0.28], natureRole: 'leaf' }
	],
	bark: [
		{ name: 'Nature Bark Dark', color: [0.18, 0.12, 0.08], natureRole: 'bark' },
		{ name: 'Nature Bark Mid', color: [0.27, 0.18, 0.12], natureRole: 'bark' },
		{ name: 'Nature Bark Light', color: [0.36, 0.26, 0.18], natureRole: 'bark' }
	]
};

export function ensureNatureMaterials(): {
	grassIds: number[];
	leafIds: number[];
	barkIds: number[];
} {
	const grassIds = ensureNatureMaterialGroup(NATURE_MATERIALS.grass).map((entry) => entry.id);
	const leafIds = ensureNatureMaterialGroup(NATURE_MATERIALS.leaf).map((entry) => entry.id);
	const barkIds = ensureNatureMaterialGroup(NATURE_MATERIALS.bark).map((entry) => entry.id);

	return { grassIds, leafIds, barkIds };
}

export function getNatureMaterialSet(): {
	grassIds: number[];
	leafIds: number[];
	barkIds: number[];
} {
	return {
		grassIds: getNatureMaterialIds('grass'),
		leafIds: getNatureMaterialIds('leaf'),
		barkIds: getNatureMaterialIds('bark')
	};
}

function ensureNatureMaterialGroup(
	definitions: ReadonlyArray<NatureMaterialDefinition>
): VoxelPaletteEntry[] {
	return definitions.map((definition) =>
		ensureVoxelMaterial({
			name: definition.name,
			color: definition.color,
			opacity: 1,
			isWater: false,
			emitsLight: false,
			lightTint: definition.color,
			natureRole: definition.natureRole,
			assignToHotbar: false
		})
	);
}
