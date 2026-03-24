import { getInteractionBoxToolMode } from '$lib/editor/editorState';
import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import { createPreviewBox, getToolTargetCoord } from '$lib/editor/editorTargets';
import { paintRegion } from '$lib/editor/paintTool';
import { isSelectableVoxelMaterial } from '$lib/voxel/voxelPalette';
import { carveBoxCommand, fillBoxCommand, hollowBoxCommand } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldBox } from '$lib/voxel/voxelTypes';

export class BoxTool implements EditorTool {
	private previewBox: WorldBox | null = null;

	begin(context: EditorToolContext, hit: VoxelHit | null): void {
		const previewSpan = this.getPreviewSpan(context);
		const start =
			context.editorState.dragStart ??
			getToolTargetCoord(
				context.editorState.activeTool,
				hit,
				context.editorState.selectedVoxelSize
			);

		if (!start) {
			return;
		}

		context.editorState.dragStart = start;
		this.previewBox = createPreviewBox(start, start, previewSpan);
		context.editorState.previewBox = this.previewBox;
	}

	update(context: EditorToolContext, hit: VoxelHit | null): void {
		const dragStart = context.editorState.dragStart;

		if (!dragStart || !hit) {
			return;
		}

		const current = getToolTargetCoord(
			context.editorState.activeTool,
			hit,
			context.editorState.selectedVoxelSize
		);

		if (!current) {
			return;
		}

		this.previewBox = createPreviewBox(dragStart, current, this.getPreviewSpan(context));
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
				if (!isSelectableVoxelMaterial(context.editorState.selectedVoxelId)) {
					this.reset(context);
					return;
				}

				result = fillBoxCommand(
					context.world,
					box.min,
					box.max,
					context.editorState.selectedVoxelId,
					context.editorState.selectedVoxelSize
				);
				break;
			case 'hollow':
				if (!isSelectableVoxelMaterial(context.editorState.selectedVoxelId)) {
					this.reset(context);
					return;
				}

				result = hollowBoxCommand(
					context.world,
					box.min,
					box.max,
					context.editorState.selectedVoxelId,
					context.editorState.selectedVoxelSize
				);
				break;
			case 'carve':
				result = carveBoxCommand(context.world, box.min, box.max);
				break;
			case 'paint':
				if (!isSelectableVoxelMaterial(context.editorState.selectedVoxelId)) {
					this.reset(context);
					return;
				}

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

	private getPreviewSpan(context: EditorToolContext): number {
		const boxMode = getInteractionBoxToolMode(
			context.editorState.activeTool,
			context.editorState.dragMode
		);

		return boxMode === 'solid' || boxMode === 'hollow' ? context.editorState.selectedVoxelSize : 1;
	}
}
