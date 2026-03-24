import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import { getToolTargetCoord, worldCoordToKey } from '$lib/editor/editorTargets';
import { VOXEL_AIR } from '$lib/voxel/constants';
import { isSelectableVoxelMaterial } from '$lib/voxel/voxelPalette';
import { paintVoxelCommand, setVoxelCommand } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { WorldCoord } from '$lib/voxel/voxelTypes';

interface StrokePlane {
	axis: 'x' | 'y' | 'z';
	value: number;
}

export class BrushTool implements EditorTool {
	private lastAppliedKey: string | null = null;
	private strokePlane: StrokePlane | null = null;

	begin(context: EditorToolContext, hit: VoxelHit | null): void {
		this.lastAppliedKey = null;
		this.strokePlane = this.createStrokePlane(context, hit);
		context.editorState.dragStart = this.getStrokeTarget(context, hit);
		this.apply(context, hit);
	}

	update(context: EditorToolContext, hit: VoxelHit | null): void {
		this.apply(context, hit);
	}

	end(context: EditorToolContext): void {
		this.lastAppliedKey = null;
		this.strokePlane = null;
		context.editorState.dragStart = null;
		context.editorState.previewBox = null;
	}

	private apply(context: EditorToolContext, hit: VoxelHit | null): void {
		if (!hit) {
			return;
		}

		const target = this.getStrokeTarget(context, hit);

		if (!target) {
			return;
		}

		const materialId = context.editorState.selectedVoxelId;
		const strokeKey = `${context.editorState.activeTool}:${materialId}:${context.editorState.selectedVoxelSize}:${worldCoordToKey(target)}`;

		if (strokeKey === this.lastAppliedKey) {
			return;
		}

		let result;

		switch (context.editorState.activeTool) {
			case 'brush-add':
				if (!isSelectableVoxelMaterial(materialId)) {
					return;
				}

				if (!context.player.canPlaceBlockAt(target, context.editorState.selectedVoxelSize)) {
					return;
				}

				result = setVoxelCommand(
					context.world,
					target.x,
					target.y,
					target.z,
					materialId,
					context.editorState.selectedVoxelSize
				);
				break;
			case 'brush-remove':
				result = setVoxelCommand(context.world, target.x, target.y, target.z, VOXEL_AIR);
				break;
			case 'brush-paint':
				if (!isSelectableVoxelMaterial(materialId)) {
					return;
				}

				result = paintVoxelCommand(context.world, target.x, target.y, target.z, materialId);
				break;
			default:
				return;
		}

		this.lastAppliedKey = strokeKey;

		if (result.changedVoxelCount > 0) {
			context.commit(result);
		}
	}

	private getStrokeTarget(context: EditorToolContext, hit: VoxelHit | null): WorldCoord | null {
		const target = getToolTargetCoord(
			context.editorState.activeTool,
			hit,
			context.editorState.selectedVoxelSize
		);

		if (!target || !this.strokePlane) {
			return target;
		}

		return {
			...target,
			[this.strokePlane.axis]: this.strokePlane.value
		};
	}

	private createStrokePlane(context: EditorToolContext, hit: VoxelHit | null): StrokePlane | null {
		if (!hit) {
			return null;
		}

		const target = getToolTargetCoord(
			context.editorState.activeTool,
			hit,
			context.editorState.selectedVoxelSize
		);

		if (!target) {
			return null;
		}

		if (hit.normal.x !== 0) {
			return { axis: 'x', value: target.x };
		}

		if (hit.normal.y !== 0) {
			return { axis: 'y', value: target.y };
		}

		return { axis: 'z', value: target.z };
	}
}
