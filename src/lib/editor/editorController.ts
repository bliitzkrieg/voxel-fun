import * as THREE from 'three';

import {
	createEditorState,
	getEditorModeForTool,
	getInteractionBoxToolMode,
	isBoxTool,
	setActiveEditorTool,
	type EditorState
} from '$lib/editor/editorState';
import { BoxTool } from '$lib/editor/boxTool';
import { BrushTool } from '$lib/editor/brushTool';
import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import { createPreviewBox, getToolTargetCoord } from '$lib/editor/editorTargets';
import { InputState } from '$lib/engine/input';
import { PlayerController } from '$lib/player/playerController';
import { DEFAULT_VOXEL_SIZE, VOXEL_SIZE_PRESETS, VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import { getVoxelPaletteEntry } from '$lib/voxel/voxelPalette';
import type { ChunkCoord, ChunkKey, WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
import { raycastVoxel } from '$lib/voxel/voxelRaycast';
import type { VoxelCommandResult } from '$lib/voxel/voxelCommands';
import type { VoxelWorld } from '$lib/voxel/world';

const MAX_EDIT_DISTANCE = 14 * DEFAULT_VOXEL_SIZE;
const MAX_UNDO_ENTRIES = 64;
const ADD_COLOR = new THREE.Color('#44d17a');
const REMOVE_COLOR = new THREE.Color('#ff6b57');
const PAINT_COLOR = new THREE.Color('#4dc9ff');
type WorldSnapshot = ReturnType<VoxelWorld['getBlocks']>;

export class EditorController {
	readonly state: EditorState = createEditorState();

	private readonly boxTool = new BoxTool();
	private readonly brushTool = new BrushTool();
	private readonly rayDirection = new THREE.Vector3();
	private readonly interactionCameraPosition = new THREE.Vector3();
	private readonly interactionRayDirection = new THREE.Vector3();
	private readonly pendingChunkKeys = new Set<ChunkKey>();
	private activeInteractionTool: EditorTool | null = null;
	private readonly undoStack: WorldSnapshot[] = [];
	private pendingUndoSnapshot: WorldSnapshot | null = null;
	private hasCommittedPendingUndo = false;

	private readonly targetHighlight: THREE.LineSegments;
	private readonly boxPreviewWireframe: THREE.LineSegments;
	private readonly boxPreviewGhost: THREE.Mesh;

	constructor(
		private readonly world: VoxelWorld,
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: InputState,
		private readonly scene: THREE.Object3D,
		private readonly player: PlayerController,
		private readonly applyWorldSnapshot: (blocks: WorldSnapshot) => boolean
	) {
		this.targetHighlight = createWireCube(ADD_COLOR, 0.9);
		this.boxPreviewWireframe = createWireCube(ADD_COLOR, 0.95);
		this.boxPreviewGhost = createGhostCube(ADD_COLOR, 0.14);

		this.scene.add(this.targetHighlight, this.boxPreviewWireframe, this.boxPreviewGhost);
	}

	update(): Set<ChunkKey> {
		this.handleModeToggle();

		if (!this.state.enabled) {
			this.clearInteraction();
			this.state.hoverHit = null;
			this.state.previewBox = null;
			this.updatePreviewState();
			return this.consumePendingChunkKeys();
		}

		this.handleHotkeys();
		this.updateHoverHit();
		this.handleSampleInput();
		this.handleToolInput();
		this.updatePreviewState();

		return this.consumePendingChunkKeys();
	}

	getPlacementTarget(): WorldCoord | null {
		return getToolTargetCoord(
			this.state.activeTool,
			this.state.hoverHit,
			this.state.selectedVoxelSize
		);
	}

	getHoveredChunkCoord(): ChunkCoord | null {
		const coord = this.getPlacementTarget() ?? this.state.hoverHit?.voxel ?? null;

		if (!coord) {
			return null;
		}

		return this.world.getChunkCoordFromWorld(coord.x, coord.y, coord.z);
	}

	dispose(): void {
		this.scene.remove(this.targetHighlight, this.boxPreviewWireframe, this.boxPreviewGhost);
		disposePreviewObject(this.targetHighlight);
		disposePreviewObject(this.boxPreviewWireframe);
		disposePreviewObject(this.boxPreviewGhost);
	}

	resetTransientState(): void {
		this.clearInteraction();
		this.state.hoverHit = null;
		this.updatePreviewState();
	}

	private handleModeToggle(): void {
		if (this.input.consumeKeyPress('Tab') || this.input.consumeKeyPress('F1')) {
			this.state.enabled = !this.state.enabled;

			if (!this.state.enabled) {
				this.clearInteraction();
			}
		}
	}

	private handleHotkeys(): void {
		if (this.consumeUndoHotkey()) {
			this.undoLastEdit();
			return;
		}

		if (this.input.isButtonDown(0)) {
			return;
		}

		if (this.input.consumeKeyPress('KeyQ')) {
			setActiveEditorTool(this.state, 'brush-add');
		}

		if (this.input.consumeKeyPress('KeyE')) {
			setActiveEditorTool(this.state, 'brush-remove');
		}

		if (this.input.consumeKeyPress('KeyR')) {
			const paintTool = this.input.isShiftDown() ? 'box-paint' : 'brush-paint';
			setActiveEditorTool(this.state, paintTool);
		}

		if (this.input.consumeKeyPress('KeyB')) {
			setActiveEditorTool(this.state, 'box-fill');
		}

		if (this.input.consumeKeyPress('KeyH')) {
			setActiveEditorTool(this.state, 'box-hollow');
		}

		if (this.input.consumeKeyPress('KeyC')) {
			setActiveEditorTool(this.state, 'box-carve');
		}

		this.handleMaterialHotkeys();

		const wheelSteps = this.input.consumeWheelSteps();

		if (wheelSteps !== 0) {
			this.shiftSelectedSize(-wheelSteps);
		}

		if (this.input.consumeKeyPress('Minus')) {
			this.shiftSelectedSize(-1);
		}

		if (this.input.consumeKeyPress('Equal')) {
			this.shiftSelectedSize(1);
		}

		this.state.mode = getEditorModeForTool(this.state.activeTool);
	}

	private updateHoverHit(): void {
		this.camera.getWorldDirection(this.rayDirection);
		const origin = this.camera.position.clone().divideScalar(VOXEL_WORLD_SIZE);
		this.state.hoverHit = raycastVoxel(this.world, origin, this.rayDirection, MAX_EDIT_DISTANCE);
	}

	private handleSampleInput(): void {
		if (!this.input.consumeButtonPress(1) || !this.state.hoverHit) {
			return;
		}

		this.state.selectedVoxelId = this.state.hoverHit.block.materialId;
		this.state.selectedVoxelSize = this.state.hoverHit.block.size;
	}

	private handleToolInput(): void {
		if (this.input.consumeButtonPress(0)) {
			this.clearInteraction();
			this.captureUndoSnapshot();
			this.state.dragMode = this.shouldUseRegionDrag() ? 'region' : 'single';
			const tool = this.resolveActiveTool();
			const context = this.createToolContext();
			this.activeInteractionTool = tool;
			this.activeInteractionTool.begin(context, this.state.hoverHit);
			this.captureInteractionPose();
		}

		if (!this.activeInteractionTool) {
			return;
		}

		if (!this.input.isButtonDown(0)) {
			if (this.input.consumeButtonRelease(0)) {
				const context = this.createToolContext();
				this.activeInteractionTool.end(context);
			}

			this.clearInteraction();
			return;
		}

		if (this.activeInteractionTool === this.brushTool && !this.hasInteractionPoseChanged()) {
			return;
		}

		const context = this.createToolContext();
		this.activeInteractionTool.update(context, this.state.hoverHit);
		this.captureInteractionPose();
	}

	private updatePreviewState(): void {
		const placementBox = this.state.enabled ? this.getPlacementTargetBox() : null;
		const showBoxPreview = this.state.enabled && !!this.state.previewBox;

		this.targetHighlight.visible = this.state.enabled && placementBox !== null;
		this.boxPreviewWireframe.visible = showBoxPreview;
		this.boxPreviewGhost.visible = showBoxPreview;

		if (placementBox) {
			positionBoxPreview(this.targetHighlight, placementBox, 1.01);
			setPreviewColor(this.targetHighlight, this.getModeColor());
		}

		if (showBoxPreview && this.state.previewBox) {
			positionBoxPreview(this.boxPreviewWireframe, this.state.previewBox, 1.01);
			positionBoxPreview(this.boxPreviewGhost, this.state.previewBox, 1);
			setPreviewColor(this.boxPreviewWireframe, this.getModeColor());
			setPreviewColor(this.boxPreviewGhost, this.getModeColor());
		}
	}

	private resolveActiveTool(): EditorTool {
		return getInteractionBoxToolMode(this.state.activeTool, this.state.dragMode)
			? this.boxTool
			: this.brushTool;
	}

	private createToolContext(): EditorToolContext {
		return {
			world: this.world,
			player: this.player,
			editorState: this.state,
			commit: (result: VoxelCommandResult) => {
				this.commitPendingUndoSnapshot();

				for (const chunkKey of result.affectedChunkKeys) {
					this.pendingChunkKeys.add(chunkKey);
				}
			}
		};
	}

	private shiftSelectedSize(step: number): void {
		const presetSizes: readonly number[] = VOXEL_SIZE_PRESETS;
		const currentIndex = presetSizes.indexOf(this.state.selectedVoxelSize);
		const safeIndex = currentIndex >= 0 ? currentIndex : 0;
		const nextIndex = Math.max(0, Math.min(VOXEL_SIZE_PRESETS.length - 1, safeIndex + step));
		this.state.selectedVoxelSize = VOXEL_SIZE_PRESETS[nextIndex] ?? this.state.selectedVoxelSize;
	}

	private handleMaterialHotkeys(): void {
		for (let materialId = 1; materialId <= 9; materialId += 1) {
			if (
				!this.input.consumeKeyPress(`Digit${materialId}`) &&
				!this.input.consumeKeyPress(`Numpad${materialId}`)
			) {
				continue;
			}

			if (getVoxelPaletteEntry(materialId)) {
				this.state.selectedVoxelId = materialId;
			}

			return;
		}
	}

	private consumePendingChunkKeys(): Set<ChunkKey> {
		const chunkKeys = new Set(this.pendingChunkKeys);
		this.pendingChunkKeys.clear();
		return chunkKeys;
	}

	private clearInteraction(): void {
		this.activeInteractionTool = null;
		this.state.dragStart = null;
		this.state.previewBox = null;
		this.state.dragMode = 'single';
		this.pendingUndoSnapshot = null;
		this.hasCommittedPendingUndo = false;
	}

	private captureInteractionPose(): void {
		this.interactionCameraPosition.copy(this.camera.position);
		this.interactionRayDirection.copy(this.rayDirection);
	}

	private hasInteractionPoseChanged(): boolean {
		return (
			this.interactionCameraPosition.distanceToSquared(this.camera.position) > 1e-6 ||
			this.interactionRayDirection.angleTo(this.rayDirection) > 1e-4
		);
	}

	private shouldUseRegionDrag(): boolean {
		if (isBoxTool(this.state.activeTool)) {
			return true;
		}

		return this.input.isShiftDown();
	}

	private getModeColor(): THREE.Color {
		switch (this.state.mode) {
			case 'remove':
				return REMOVE_COLOR;
			case 'paint':
				return PAINT_COLOR;
			default:
				return ADD_COLOR;
		}
	}

	private getPlacementTargetBox(): WorldBox | null {
		const target = this.getPlacementTarget();

		if (!target) {
			return null;
		}

		if (
			this.state.activeTool === 'brush-add' ||
			this.state.activeTool === 'box-fill' ||
			this.state.activeTool === 'box-hollow'
		) {
			return createPreviewBox(target, target, this.state.selectedVoxelSize);
		}

		return this.state.hoverHit?.blockBox ?? createPreviewBox(target, target);
	}

	private consumeUndoHotkey(): boolean {
		return this.isUndoModifierDown() && this.input.consumeKeyPress('KeyZ');
	}

	private isUndoModifierDown(): boolean {
		return (
			this.input.isKeyDown('ControlLeft') ||
			this.input.isKeyDown('ControlRight') ||
			this.input.isKeyDown('MetaLeft') ||
			this.input.isKeyDown('MetaRight')
		);
	}

	private captureUndoSnapshot(): void {
		this.pendingUndoSnapshot = cloneWorldSnapshot(this.world.getBlocks());
		this.hasCommittedPendingUndo = false;
	}

	private commitPendingUndoSnapshot(): void {
		if (!this.pendingUndoSnapshot || this.hasCommittedPendingUndo) {
			return;
		}

		this.undoStack.push(this.pendingUndoSnapshot);

		if (this.undoStack.length > MAX_UNDO_ENTRIES) {
			this.undoStack.splice(0, this.undoStack.length - MAX_UNDO_ENTRIES);
		}

		this.pendingUndoSnapshot = null;
		this.hasCommittedPendingUndo = true;
	}

	private undoLastEdit(): void {
		const snapshot = this.undoStack.pop();

		if (!snapshot) {
			return;
		}

		this.clearInteraction();
		this.pendingChunkKeys.clear();

		if (!this.applyWorldSnapshot(cloneWorldSnapshot(snapshot))) {
			this.undoStack.push(snapshot);
		}
	}
}

function createWireCube(color: THREE.ColorRepresentation, opacity: number): THREE.LineSegments {
	const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthTest: false
	});
	const helper = new THREE.LineSegments(geometry, material);

	helper.visible = false;
	helper.renderOrder = 20;

	return helper;
}

function createGhostCube(color: THREE.ColorRepresentation, opacity: number): THREE.Mesh {
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const material = new THREE.MeshBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthWrite: false,
		depthTest: false
	});
	const mesh = new THREE.Mesh(geometry, material);

	mesh.visible = false;
	mesh.renderOrder = 19;

	return mesh;
}

function positionBoxPreview(object: THREE.Object3D, box: WorldBox, scaleOffset: number): void {
	const sizeX = box.max.x - box.min.x + 1;
	const sizeY = box.max.y - box.min.y + 1;
	const sizeZ = box.max.z - box.min.z + 1;

	object.position.set(box.min.x + sizeX * 0.5, box.min.y + sizeY * 0.5, box.min.z + sizeZ * 0.5);
	object.scale.set(sizeX * scaleOffset, sizeY * scaleOffset, sizeZ * scaleOffset);
}

function setPreviewColor(object: THREE.Object3D, color: THREE.Color): void {
	object.traverse((child) => {
		const material = (
			child as THREE.Object3D & {
				material?: THREE.Material | THREE.Material[];
			}
		).material;

		if (Array.isArray(material)) {
			for (const entry of material) {
				copyMaterialColor(entry, color);
			}
			return;
		}

		if (material) {
			copyMaterialColor(material, color);
		}
	});
}

function copyMaterialColor(material: THREE.Material, color: THREE.Color): void {
	const colorMaterial = material as THREE.Material & { color?: THREE.Color };
	colorMaterial.color?.copy(color);
}

function disposePreviewObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		const mesh = child as THREE.Mesh;

		mesh.geometry?.dispose();

		if (Array.isArray(mesh.material)) {
			for (const material of mesh.material) {
				material.dispose();
			}
		} else {
			mesh.material?.dispose();
		}
	});
}

function cloneWorldSnapshot(blocks: WorldSnapshot): WorldSnapshot {
	return blocks.map((block) => ({
		materialId: block.materialId,
		origin: { ...block.origin },
		size: block.size
	}));
}
