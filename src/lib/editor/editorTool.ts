import type { EditorState } from '$lib/editor/editorState';
import type { PlayerController } from '$lib/player/playerController';
import type { VoxelCommandResult } from '$lib/voxel/voxelCommands';
import type { VoxelHit } from '$lib/voxel/voxelRaycast';
import type { VoxelWorld } from '$lib/voxel/world';

export interface EditorToolContext {
	world: VoxelWorld;
	player: PlayerController;
	editorState: EditorState;
	commit(result: VoxelCommandResult): void;
}

export interface EditorTool {
	begin(context: EditorToolContext, hit: VoxelHit | null): void;
	update(context: EditorToolContext, hit: VoxelHit | null): void;
	end(context: EditorToolContext): void;
}
