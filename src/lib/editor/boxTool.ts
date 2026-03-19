import { getInteractionBoxToolMode } from '$lib/editor/editorState';
import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import {
	constrainTargetCoord,
	createPreviewBox,
	getToolTargetCoord
} from '$lib/editor/editorTargets';
import { paintRegion } from '$lib/editor/paintTool';
import { carveBoxCommand, fillBoxCommand, hollowBoxCommand } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldBox } from '$lib/voxel/voxelTypes';

export class BoxTool implements EditorTool {
	private previewBox: WorldBox | null = null;

	begin(context: EditorToolContext, hit: VoxelHit | null): void {
		const start =
			context.editorState.dragStart ?? getToolTargetCoord(context.editorState.activeTool, hit);

		if (!start) {
			return;
		}

		context.editorState.dragStart = start;
		this.previewBox = createPreviewBox(start, start);
		context.editorState.previewBox = this.previewBox;
	}

	update(context: EditorToolContext, hit: VoxelHit | null): void {
		const dragStart = context.editorState.dragStart;

		if (!dragStart || !hit) {
			return;
		}

		const current = getToolTargetCoord(context.editorState.activeTool, hit);

		if (!current) {
			return;
		}

		const constrainedTarget = constrainTargetCoord(
			dragStart,
			current,
			context.editorState.boxConstraint
		);

		this.previewBox = createPreviewBox(dragStart, constrainedTarget);
		context.editorState.previewBox = this.previewBox;
	}

	end(context: EditorToolContext): void {
		const box = this.previewBox;
		const boxMode = getInteractionBoxToolMode(
			context.editorState.activeTool,
			context.editorState.dragMode
		);

		if (!box || !boxMode) {
			this.reset(context);
			return;
		}

		let result;

		switch (boxMode) {
			case 'solid':
				result = fillBoxCommand(
					context.world,
					box.min,
					box.max,
					context.editorState.selectedVoxelId
				);
				break;
			case 'hollow':
				result = hollowBoxCommand(
					context.world,
					box.min,
					box.max,
					context.editorState.selectedVoxelId
				);
				break;
			case 'carve':
				result = carveBoxCommand(context.world, box.min, box.max);
				break;
			case 'paint':
				result = paintRegion(context.world, box.min, box.max, context.editorState.selectedVoxelId);
				break;
		}

		if (result.changedVoxelCount > 0) {
			context.commit(result);
		}

		this.reset(context);
	}

	private reset(context: EditorToolContext): void {
		context.editorState.dragStart = null;
		context.editorState.previewBox = null;
		this.previewBox = null;
	}
}
