import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import {
	paintNatureFlowers,
	paintNatureGrass,
	placeNatureTree,
	resolveNatureGroundAnchor
} from '$lib/nature/natureGeneration';
import { getNatureUiState } from '$lib/ui/natureState';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';

export class NatureTool implements EditorTool {
	private lastAppliedKey: string | null = null;
	private placedTreeThisStroke = false;

	begin(context: EditorToolContext, hit: VoxelHit | null): void {
		this.lastAppliedKey = null;
		this.placedTreeThisStroke = false;
		this.apply(context, hit);
	}

	update(context: EditorToolContext, hit: VoxelHit | null): void {
		this.apply(context, hit);
	}

	end(): void {
		this.lastAppliedKey = null;
		this.placedTreeThisStroke = false;
	}

	private apply(context: EditorToolContext, hit: VoxelHit | null): void {
		const natureState = getNatureUiState();

		if (context.editorState.activeTool === 'nature-tree') {
			if (this.placedTreeThisStroke) {
				return;
			}

			const result = placeNatureTree(context.world, context.player, hit, natureState.treeSettings);

			this.placedTreeThisStroke = true;

			if (result.changedVoxelCount > 0) {
				context.commit(result);
			}

			return;
		}

		const anchor = resolveNatureGroundAnchor(context.world, hit);

		if (!anchor) {
			return;
		}

		const strokeKey =
			context.editorState.activeTool === 'nature-flower'
				? `${anchor.x},${anchor.surfaceY},${anchor.z}:flower:${natureState.flowerSettings.radius}:${natureState.flowerSettings.density}:${natureState.flowerSettings.seedOffset}`
				: `${anchor.x},${anchor.surfaceY},${anchor.z}:grass:${natureState.grassSettings.radius}:${natureState.grassSettings.density}:${natureState.grassSettings.heightVariance}:${natureState.grassSettings.seedOffset}`;

		if (strokeKey === this.lastAppliedKey) {
			return;
		}

		this.lastAppliedKey = strokeKey;

		const result =
			context.editorState.activeTool === 'nature-flower'
				? paintNatureFlowers(context.world, context.player, hit, natureState.flowerSettings)
				: paintNatureGrass(context.world, context.player, hit, natureState.grassSettings);

		if (result.changedVoxelCount > 0) {
			context.commit(result);
		}
	}
}
