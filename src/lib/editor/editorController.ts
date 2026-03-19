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
import { getToolTargetCoord } from '$lib/editor/editorTargets';
import { InputState } from '$lib/engine/input';
import { PlayerController } from '$lib/player/playerController';
import { cycleVoxelMaterialId } from '$lib/voxel/voxelPalette';
import type { ChunkCoord, ChunkKey, WorldBox, WorldCoord } from '$lib/voxel/voxelTypes';
import { raycastVoxel } from '$lib/voxel/voxelRaycast';
import type { VoxelCommandResult } from '$lib/voxel/voxelCommands';
import type { VoxelWorld } from '$lib/voxel/world';

const MAX_EDIT_DISTANCE = 14;
const HOVER_COLOR = new THREE.Color('#ffc857');
const ADD_COLOR = new THREE.Color('#44d17a');
const REMOVE_COLOR = new THREE.Color('#ff6b57');
const PAINT_COLOR = new THREE.Color('#4dc9ff');

export class EditorController {
	readonly state: EditorState = createEditorState();

	private readonly boxTool = new BoxTool();
	private readonly brushTool = new BrushTool();
	private readonly rayDirection = new THREE.Vector3();
	private readonly pendingChunkKeys = new Set<ChunkKey>();
	private activeInteractionTool: EditorTool | null = null;

	private readonly hoverHighlight: THREE.LineSegments;
	private readonly targetHighlight: THREE.LineSegments;
	private readonly boxPreviewWireframe: THREE.LineSegments;
	private readonly boxPreviewGhost: THREE.Mesh;

	constructor(
		private readonly world: VoxelWorld,
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: InputState,
		private readonly scene: THREE.Scene,
		private readonly player: PlayerController
	) {
		this.hoverHighlight = createWireCube(HOVER_COLOR, 0.95);
		this.targetHighlight = createWireCube(ADD_COLOR, 0.9);
		this.boxPreviewWireframe = createWireCube(ADD_COLOR, 0.95);
		this.boxPreviewGhost = createGhostCube(ADD_COLOR, 0.14);

		this.scene.add(
			this.hoverHighlight,
			this.targetHighlight,
			this.boxPreviewWireframe,
			this.boxPreviewGhost
		);
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
		this.handleToolInput();
		this.updatePreviewState();

		return this.consumePendingChunkKeys();
	}

	getPlacementTarget(): WorldCoord | null {
		return getToolTargetCoord(this.state.activeTool, this.state.hoverHit);
	}

	getHoveredChunkCoord(): ChunkCoord | null {
		const coord = this.getPlacementTarget() ?? this.state.hoverHit?.voxel ?? null;

		if (!coord) {
			return null;
		}

		return this.world.getChunkCoordFromWorld(coord.x, coord.y, coord.z);
	}

	dispose(): void {
		this.scene.remove(
			this.hoverHighlight,
			this.targetHighlight,
			this.boxPreviewWireframe,
			this.boxPreviewGhost
		);
		disposePreviewObject(this.hoverHighlight);
		disposePreviewObject(this.targetHighlight);
		disposePreviewObject(this.boxPreviewWireframe);
		disposePreviewObject(this.boxPreviewGhost);
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
			const paintTool =
				this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight')
					? 'box-paint'
					: 'brush-paint';
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

		if (this.input.consumeKeyPress('Digit1')) {
			this.state.boxConstraint = 'free';
		}

		if (this.input.consumeKeyPress('Digit2')) {
			this.state.boxConstraint = 'horizontal';
		}

		if (this.input.consumeKeyPress('Digit3')) {
			this.state.boxConstraint = 'vertical-x';
		}

		if (this.input.consumeKeyPress('Digit4')) {
			this.state.boxConstraint = 'vertical-z';
		}

		if (this.input.consumeKeyPress('BracketLeft')) {
			this.shiftSelectedMaterial(-1);
		}

		if (this.input.consumeKeyPress('BracketRight')) {
			this.shiftSelectedMaterial(1);
		}

		const wheelSteps = this.input.consumeWheelSteps();

		if (wheelSteps !== 0) {
			this.shiftSelectedMaterial(wheelSteps);
		}

		this.state.mode = getEditorModeForTool(this.state.activeTool);
	}

	private updateHoverHit(): void {
		this.camera.getWorldDirection(this.rayDirection);
		this.state.hoverHit = raycastVoxel(
			this.world,
			this.camera.position,
			this.rayDirection,
			MAX_EDIT_DISTANCE
		);
	}

	private handleToolInput(): void {
		if (this.input.consumeButtonPress(0)) {
			this.state.dragMode = this.shouldUseRegionDrag() ? 'region' : 'single';
			const tool = this.resolveActiveTool();
			const context = this.createToolContext();
			this.activeInteractionTool = tool;
			this.activeInteractionTool.begin(context, this.state.hoverHit);
		}

		if (this.activeInteractionTool && this.input.isButtonDown(0)) {
			this.promoteInteractionToRegion();
			const context = this.createToolContext();
			this.activeInteractionTool.update(context, this.state.hoverHit);
		}

		if (this.activeInteractionTool && this.input.consumeButtonRelease(0)) {
			const context = this.createToolContext();
			this.activeInteractionTool.end(context);
			this.activeInteractionTool = null;
			this.state.dragMode = 'single';
		}
	}

	private updatePreviewState(): void {
		const hitCoord = this.state.hoverHit?.voxel ?? null;
		const placementTarget = this.state.enabled ? this.getPlacementTarget() : null;
		const showBoxPreview = this.state.enabled && !!this.state.previewBox;

		this.hoverHighlight.visible = this.state.enabled && hitCoord !== null;
		this.targetHighlight.visible = this.state.enabled && placementTarget !== null;
		this.boxPreviewWireframe.visible = showBoxPreview;
		this.boxPreviewGhost.visible = showBoxPreview;

		if (hitCoord) {
			positionVoxelPreview(this.hoverHighlight, hitCoord);
			setPreviewColor(this.hoverHighlight, HOVER_COLOR);
		}

		if (placementTarget) {
			positionVoxelPreview(this.targetHighlight, placementTarget);
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
				for (const chunkKey of result.affectedChunkKeys) {
					this.pendingChunkKeys.add(chunkKey);
				}
			}
		};
	}

	private shiftSelectedMaterial(step: number): void {
		this.state.selectedVoxelId = cycleVoxelMaterialId(this.state.selectedVoxelId, step);
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
	}

	private shouldUseRegionDrag(): boolean {
		if (isBoxTool(this.state.activeTool)) {
			return true;
		}

		return this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight');
	}

	private promoteInteractionToRegion(): void {
		if (this.state.dragMode === 'region' || this.activeInteractionTool !== this.brushTool) {
			return;
		}

		if (!this.shouldUseRegionDrag()) {
			return;
		}

		if (!getInteractionBoxToolMode(this.state.activeTool, 'region')) {
			return;
		}

		this.state.dragMode = 'region';
		this.activeInteractionTool = this.boxTool;
		this.activeInteractionTool.begin(this.createToolContext(), this.state.hoverHit);
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

function positionVoxelPreview(object: THREE.Object3D, coord: WorldCoord): void {
	object.position.set(coord.x + 0.5, coord.y + 0.5, coord.z + 0.5);
	object.scale.setScalar(1.01);
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
