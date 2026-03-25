import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

import {
	createEditorState,
	getEditorModeForTool,
	getEditorToolLabel,
	getInteractionBoxToolMode,
	isBoxTool,
	setActiveEditorTool,
	type EditorState
} from '$lib/editor/editorState';
import { BoxTool } from '$lib/editor/boxTool';
import { BrushTool } from '$lib/editor/brushTool';
import { NatureTool } from '$lib/editor/natureTool';
import type { EditorTool, EditorToolContext } from '$lib/editor/editorTool';
import { createPreviewBox, getToolTargetCoord } from '$lib/editor/editorTargets';
import { InputState } from '$lib/engine/input';
import {
	buildNatureTreePreview,
	resolveNatureGroundAnchor,
	type NatureTreePreview
} from '$lib/nature/natureGeneration';
import type { NatureActiveTool, NatureEditorTool } from '$lib/nature/natureTypes';
import { PlayerController } from '$lib/player/playerController';
import { getNatureUiState } from '$lib/ui/natureState';
import {
	clearPropPlacement,
	openPropManager,
	setPropPlacementTransformMode,
	startPropPlacement
} from '$lib/ui/propManagerState';
import {
	DEFAULT_VOXEL_SIZE,
	VOXEL_AIR,
	VOXEL_SIZE_PRESETS,
	VOXEL_WORLD_SIZE
} from '$lib/voxel/constants';
import {
	createPropDefinition,
	createSerializedPropLibraryState,
	getPropDefinition,
	type SerializedPropLibraryState
} from '$lib/voxel/propLibrary';
import {
	capturePropDefinitionBlocks,
	normalizeQuarterTurns,
	resolvePropDefinitionBlocks
} from '$lib/voxel/propTransforms';
import {
	createSerializedVoxelPaletteState,
	getFirstSelectableHotbarMaterialId,
	getFirstSelectableVoxelMaterialId,
	getHotbarMaterialId,
	isSelectableVoxelMaterial,
	type SerializedVoxelPaletteState
} from '$lib/voxel/voxelPalette';
import { raycastVoxel } from '$lib/voxel/voxelRaycast';
import { createVoxelCommandResult, type VoxelCommandResult } from '$lib/voxel/voxelCommands';
import type {
	ChunkCoord,
	ChunkKey,
	PropDefinition,
	PropDefinitionBlock,
	PropId,
	PropInstanceRotation,
	VoxelBlock,
	VoxelBlockId,
	WorldBox,
	WorldCoord
} from '$lib/voxel/voxelTypes';
import type {
	SerializedWorldBlock,
	SerializedWorldPropInstance,
	VoxelWorld
} from '$lib/voxel/world';

const MAX_EDIT_DISTANCE = 14 * DEFAULT_VOXEL_SIZE;
const MAX_UNDO_ENTRIES = 64;
const ADD_COLOR = new THREE.Color('#44d17a');
const REMOVE_COLOR = new THREE.Color('#ff6b57');
const PAINT_COLOR = new THREE.Color('#4dc9ff');
const SELECT_COLOR = new THREE.Color('#ffd84a');
const PROP_VALID_COLOR = new THREE.Color('#5ef0ff');
const PROP_INVALID_COLOR = new THREE.Color('#ff6b57');
const NATURE_PREVIEW_COLOR = new THREE.Color('#8fd66b');
const NATURE_INVALID_COLOR = new THREE.Color('#ff8667');

type WorldSnapshot = ReturnType<VoxelWorld['getBlocks']>;
type PropInstanceSnapshot = ReturnType<VoxelWorld['getPropInstances']>;
type SelectionOperation = 'replace' | 'add' | 'subtract';

interface ProjectSnapshot {
	blocks: WorldSnapshot;
	propInstances: PropInstanceSnapshot;
	palette: SerializedVoxelPaletteState;
	props: SerializedPropLibraryState;
}

interface ActivePropPlacement {
	prop: PropDefinition;
	origin: WorldCoord;
	rotationQuarterTurns: PropInstanceRotation;
	resolvedBlocks: PropDefinitionBlock[];
	valid: boolean;
}

export class EditorController {
	readonly state: EditorState = createEditorState();

	private readonly boxTool = new BoxTool();
	private readonly brushTool = new BrushTool();
	private readonly natureTool = new NatureTool();
	private readonly rayDirection = new THREE.Vector3();
	private readonly interactionCameraPosition = new THREE.Vector3();
	private readonly interactionRayDirection = new THREE.Vector3();
	private readonly pendingChunkKeys = new Set<ChunkKey>();
	private readonly selectedBlockIds = new Set<VoxelBlockId>();
	private readonly selectionRoot = new THREE.Group();
	private readonly selectionFillMaterial = new THREE.MeshBasicMaterial({
		color: SELECT_COLOR,
		transparent: true,
		opacity: 0.1,
		depthWrite: false,
		depthTest: false
	});
	private readonly selectionWireMaterial = new THREE.LineBasicMaterial({
		color: SELECT_COLOR,
		transparent: true,
		opacity: 0.92,
		depthTest: false
	});
	private readonly selectionBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
	private readonly selectionEdgesGeometry = new THREE.EdgesGeometry(this.selectionBoxGeometry);
	private readonly propPlacementRoot = new THREE.Group();
	private readonly propPlacementFillMaterial = new THREE.MeshBasicMaterial({
		color: PROP_VALID_COLOR,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
		depthTest: false
	});
	private readonly propPlacementWireMaterial = new THREE.LineBasicMaterial({
		color: PROP_VALID_COLOR,
		transparent: true,
		opacity: 0.96,
		depthTest: false
	});
	private readonly propPlacementBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
	private readonly propPlacementEdgesGeometry = new THREE.EdgesGeometry(
		this.propPlacementBoxGeometry
	);
	private readonly natureBrushRoot = new THREE.Group();
	private readonly natureBrushFillMaterial = new THREE.MeshBasicMaterial({
		color: NATURE_PREVIEW_COLOR,
		transparent: true,
		opacity: 0.16,
		depthWrite: false,
		depthTest: false
	});
	private readonly natureBrushRingMaterial = new THREE.MeshBasicMaterial({
		color: NATURE_PREVIEW_COLOR,
		transparent: true,
		opacity: 0.84,
		depthWrite: false,
		depthTest: false
	});
	private readonly natureBrushFillGeometry = new THREE.CircleGeometry(1, 40);
	private readonly natureBrushRingGeometry = new THREE.RingGeometry(0.94, 1, 48);
	private readonly natureTreePreviewRoot = new THREE.Group();
	private readonly natureTreePreviewFillMaterial = new THREE.MeshBasicMaterial({
		color: NATURE_PREVIEW_COLOR,
		transparent: true,
		opacity: 0.16,
		depthWrite: false,
		depthTest: false
	});
	private readonly natureTreePreviewWireMaterial = new THREE.LineBasicMaterial({
		color: NATURE_PREVIEW_COLOR,
		transparent: true,
		opacity: 0.9,
		depthTest: false
	});
	private readonly natureTreePreviewBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
	private readonly natureTreePreviewEdgesGeometry = new THREE.EdgesGeometry(
		this.natureTreePreviewBoxGeometry
	);
	private readonly transformControls: TransformControls;
	private readonly transformControlsHelper: THREE.Object3D;

	private activeInteractionTool: EditorTool | null = null;
	private readonly undoStack: ProjectSnapshot[] = [];
	private pendingUndoSnapshot: ProjectSnapshot | null = null;
	private hasCommittedPendingUndo = false;
	private selectionDragStartCell: WorldCoord | null = null;
	private selectionClickBlockId: VoxelBlockId | null = null;
	private selectionOperation: SelectionOperation = 'replace';
	private selectionConnectedAppend = false;
	private selectionWasDragged = false;
	private activePropPlacement: ActivePropPlacement | null = null;
	private lastNatureTreePreviewSignature: string | null = null;

	private readonly targetHighlight: THREE.LineSegments;
	private readonly boxPreviewWireframe: THREE.LineSegments;
	private readonly boxPreviewGhost: THREE.Mesh;

	constructor(
		private readonly world: VoxelWorld,
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: InputState,
		private readonly voxelScene: THREE.Object3D,
		private readonly worldScene: THREE.Object3D,
		private readonly domElement: HTMLElement,
		private readonly player: PlayerController,
		private readonly applyWorldSnapshot: (snapshot: ProjectSnapshot) => boolean
	) {
		this.targetHighlight = createWireCube(ADD_COLOR, 0.9);
		this.boxPreviewWireframe = createWireCube(ADD_COLOR, 0.95);
		this.boxPreviewGhost = createGhostCube(ADD_COLOR, 0.14);
		const natureBrushFill = new THREE.Mesh(
			this.natureBrushFillGeometry,
			this.natureBrushFillMaterial
		);
		const natureBrushRing = new THREE.Mesh(
			this.natureBrushRingGeometry,
			this.natureBrushRingMaterial
		);

		this.selectionRoot.visible = false;
		this.selectionRoot.renderOrder = 18;
		this.propPlacementRoot.visible = false;
		this.propPlacementRoot.rotation.order = 'XYZ';
		this.propPlacementRoot.renderOrder = 21;
		this.natureBrushRoot.visible = false;
		this.natureBrushRoot.renderOrder = 20;
		this.natureTreePreviewRoot.visible = false;
		this.natureTreePreviewRoot.renderOrder = 20;
		natureBrushFill.rotation.x = -Math.PI * 0.5;
		natureBrushFill.position.y = 0.01;
		natureBrushRing.rotation.x = -Math.PI * 0.5;
		natureBrushRing.position.y = 0.02;
		this.natureBrushRoot.add(natureBrushFill, natureBrushRing);

		this.voxelScene.add(
			this.targetHighlight,
			this.boxPreviewWireframe,
			this.boxPreviewGhost,
			this.selectionRoot,
			this.natureBrushRoot,
			this.natureTreePreviewRoot
		);
		this.worldScene.add(this.propPlacementRoot);

		this.transformControls = new TransformControls(this.camera, this.domElement);
		this.transformControls.enabled = false;
		this.transformControls.setSpace('world');
		this.transformControls.setMode('translate');
		this.transformControls.setTranslationSnap(VOXEL_WORLD_SIZE);
		this.transformControls.setRotationSnap(Math.PI * 0.5);
		this.transformControls.addEventListener('objectChange', this.handleTransformObjectChange);
		this.transformControlsHelper = this.transformControls.getHelper();
		this.transformControlsHelper.visible = false;
		this.worldScene.add(this.transformControlsHelper);
	}

	update(): Set<ChunkKey> {
		this.ensureSelectedMaterialValid();
		this.pruneSelection();
		this.handleModeToggle();

		if (this.activePropPlacement) {
			this.handlePropPlacementInput();
			this.state.hoverHit = null;
			this.state.previewBox = null;
			this.updatePreviewState();
			return this.consumePendingChunkKeys();
		}

		if (!this.state.enabled) {
			this.clearInteraction();
			this.clearSelectionDrag();
			this.state.selectionEnabled = false;
			this.state.hoverHit = null;
			this.state.previewBox = null;
			this.updatePreviewState();
			return this.consumePendingChunkKeys();
		}

		this.handleHotkeys();
		this.updateHoverHit();

		if (this.state.selectionEnabled) {
			this.handleSelectionInput();
			this.updatePreviewState();
			return this.consumePendingChunkKeys();
		}

		this.handleSampleInput();
		this.handleToolInput();
		this.updatePreviewState();
		return this.consumePendingChunkKeys();
	}

	getPlacementTarget(): WorldCoord | null {
		if (this.state.selectionEnabled || this.activePropPlacement || this.isNatureToolActive()) {
			return null;
		}

		return getToolTargetCoord(
			this.state.activeTool,
			this.state.hoverHit,
			this.state.selectedVoxelSize
		);
	}

	getHoveredChunkCoord(): ChunkCoord | null {
		if (this.activePropPlacement) {
			return this.world.getChunkCoordFromWorld(
				this.activePropPlacement.origin.x,
				this.activePropPlacement.origin.y,
				this.activePropPlacement.origin.z
			);
		}

		if (this.isNatureToolActive()) {
			const natureAnchor = resolveNatureGroundAnchor(this.world, this.state.hoverHit);

			if (!natureAnchor) {
				return null;
			}

			return this.world.getChunkCoordFromWorld(
				natureAnchor.x,
				natureAnchor.surfaceY,
				natureAnchor.z
			);
		}

		const coord = this.getPlacementTarget() ?? this.state.hoverHit?.voxel ?? null;

		if (!coord) {
			return null;
		}

		return this.world.getChunkCoordFromWorld(coord.x, coord.y, coord.z);
	}

	getSelectedMaterialId(): number {
		return this.state.selectedVoxelId;
	}

	getToolLabel(): string {
		if (this.activePropPlacement) {
			return 'Prop Placement';
		}

		if (this.state.selectionEnabled) {
			return 'Selection';
		}

		return getEditorToolLabel(this.state.activeTool);
	}

	getSelectedBlockCount(): number {
		this.pruneSelection();
		return this.selectedBlockIds.size;
	}

	isPropPlacementActive(): boolean {
		return this.activePropPlacement !== null;
	}

	getNatureToolType(): NatureActiveTool | null {
		switch (this.state.activeTool) {
			case 'nature-grass':
				return 'grass-paint';
			case 'nature-tree':
				return 'tree-place';
			default:
				return null;
		}
	}

	isTransformDragging(): boolean {
		return this.transformControls.dragging;
	}

	setSelectedMaterial(materialId: number): boolean {
		if (!isSelectableVoxelMaterial(materialId)) {
			return false;
		}

		if (this.state.selectedVoxelId === materialId) {
			return false;
		}

		this.state.selectedVoxelId = materialId;
		return true;
	}

	ensureSelectedMaterialValid(): boolean {
		if (isSelectableVoxelMaterial(this.state.selectedVoxelId)) {
			return false;
		}

		const fallbackMaterialId =
			getFirstSelectableHotbarMaterialId() ?? getFirstSelectableVoxelMaterialId() ?? 0;

		if (this.state.selectedVoxelId === fallbackMaterialId) {
			return false;
		}

		this.state.selectedVoxelId = fallbackMaterialId;
		return true;
	}

	createPropFromSelection(input: { name: string; interactable: boolean }): PropDefinition | null {
		this.pruneSelection();
		const selectedBlocks = [...this.selectedBlockIds]
			.map((blockId) => this.world.blocks.get(blockId))
			.filter((block): block is VoxelBlock => !!block);

		if (selectedBlocks.length === 0) {
			return null;
		}

		return createPropDefinition({
			name: input.name,
			interactable: input.interactable,
			blocks: capturePropDefinitionBlocks(selectedBlocks)
		});
	}

	startPropPlacement(propId: PropId): boolean {
		const prop = getPropDefinition(propId);

		if (!prop) {
			return false;
		}

		this.cancelPropPlacement();
		this.state.enabled = true;
		this.state.selectionEnabled = false;
		this.clearInteraction();
		this.clearSelectionDrag();
		if (this.isNatureToolActive()) {
			setActiveEditorTool(this.state, 'brush-add');
			this.lastNatureTreePreviewSignature = null;
		}

		this.activePropPlacement = {
			prop,
			origin: this.getSuggestedPropPlacementOrigin(prop),
			rotationQuarterTurns: { x: 0, y: 0, z: 0 },
			resolvedBlocks: [],
			valid: false
		};

		this.rebuildPropPlacementPreview(prop);
		this.propPlacementRoot.position.copy(worldCoordToWorldVector(this.activePropPlacement.origin));
		this.propPlacementRoot.rotation.set(0, 0, 0);
		this.propPlacementRoot.visible = true;
		this.transformControls.attach(this.propPlacementRoot);
		this.transformControls.enabled = true;
		this.transformControlsHelper.visible = true;
		this.transformControls.setMode('translate');
		startPropPlacement(prop.id, prop.name);
		setPropPlacementTransformMode('translate');
		this.syncPropPlacementFromRoot();
		this.updatePreviewState();
		return true;
	}

	startNatureTool(tool: NatureEditorTool): void {
		this.cancelPropPlacement();
		this.state.enabled = true;
		this.state.selectionEnabled = false;
		this.clearInteraction();
		this.clearSelection();
		this.clearSelectionDrag();
		setActiveEditorTool(this.state, tool);
		this.lastNatureTreePreviewSignature = null;
		this.updatePreviewState();
	}

	cancelNatureTool(): void {
		if (!this.isNatureToolActive()) {
			return;
		}

		this.clearInteraction();
		this.clearSelectionDrag();
		setActiveEditorTool(this.state, 'brush-add');
		this.lastNatureTreePreviewSignature = null;
		this.updatePreviewState();
	}

	cancelPlacement(): void {
		this.cancelPropPlacement();
		this.cancelNatureTool();
	}

	handleDeletedProp(propId: PropId): void {
		if (this.activePropPlacement?.prop.id === propId) {
			this.cancelPropPlacement();
		}
	}

	dispose(): void {
		this.cancelPropPlacement();
		this.cancelNatureTool();
		this.voxelScene.remove(
			this.targetHighlight,
			this.boxPreviewWireframe,
			this.boxPreviewGhost,
			this.selectionRoot,
			this.natureBrushRoot,
			this.natureTreePreviewRoot
		);
		this.worldScene.remove(this.propPlacementRoot, this.transformControlsHelper);
		disposePreviewObject(this.targetHighlight);
		disposePreviewObject(this.boxPreviewWireframe);
		disposePreviewObject(this.boxPreviewGhost);
		clearGroupChildren(this.selectionRoot);
		clearGroupChildren(this.propPlacementRoot);
		clearGroupChildren(this.natureTreePreviewRoot);
		this.selectionEdgesGeometry.dispose();
		this.selectionBoxGeometry.dispose();
		this.selectionWireMaterial.dispose();
		this.selectionFillMaterial.dispose();
		this.propPlacementEdgesGeometry.dispose();
		this.propPlacementBoxGeometry.dispose();
		this.propPlacementWireMaterial.dispose();
		this.propPlacementFillMaterial.dispose();
		this.natureBrushFillGeometry.dispose();
		this.natureBrushRingGeometry.dispose();
		this.natureBrushFillMaterial.dispose();
		this.natureBrushRingMaterial.dispose();
		this.natureTreePreviewEdgesGeometry.dispose();
		this.natureTreePreviewBoxGeometry.dispose();
		this.natureTreePreviewFillMaterial.dispose();
		this.natureTreePreviewWireMaterial.dispose();
		this.transformControls.dispose();
	}

	resetTransientState(): void {
		this.clearInteraction();
		this.clearSelectionDrag();
		this.state.hoverHit = null;
		this.state.previewBox = null;
		this.updatePreviewState();
	}

	private handleModeToggle(): void {
		if (!this.input.consumeKeyPress('Tab') && !this.input.consumeKeyPress('F1')) {
			return;
		}

		this.state.enabled = !this.state.enabled;

		if (this.state.enabled) {
			return;
		}

		this.clearInteraction();
		this.clearSelectionDrag();
		this.state.selectionEnabled = false;
		this.cancelPropPlacement();
		this.cancelNatureTool();
	}

	private handleHotkeys(): void {
		if (this.consumeUndoHotkey()) {
			this.undoLastEdit();
			return;
		}

		if (this.input.consumeKeyPress('Escape') && this.isNatureToolActive()) {
			this.cancelNatureTool();
			return;
		}

		if (this.input.consumeKeyPress('Escape') && this.selectedBlockIds.size > 0) {
			this.clearSelection();
			this.clearSelectionDrag();
			return;
		}

		if (this.input.consumeKeyPress('KeyX')) {
			if (this.isNatureToolActive()) {
				setActiveEditorTool(this.state, 'brush-add');
			}

			this.state.selectionEnabled = !this.state.selectionEnabled;
			this.clearInteraction();
			this.clearSelectionDrag();
			return;
		}

		if (this.input.isButtonDown(0)) {
			return;
		}

		if (!this.state.selectionEnabled) {
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

		if (!isSelectableVoxelMaterial(this.state.hoverHit.block.materialId)) {
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
			this.activeInteractionTool = this.resolveActiveTool();
			this.activeInteractionTool.begin(this.createToolContext(), this.state.hoverHit);
			this.captureInteractionPose();
		}

		if (!this.activeInteractionTool) {
			return;
		}

		if (!this.input.isButtonDown(0)) {
			if (this.input.consumeButtonRelease(0)) {
				this.activeInteractionTool.end(this.createToolContext());
			}

			this.clearInteraction();
			return;
		}

		if (this.activeInteractionTool === this.brushTool && !this.hasInteractionPoseChanged()) {
			return;
		}

		this.activeInteractionTool.update(this.createToolContext(), this.state.hoverHit);
		this.captureInteractionPose();
	}

	private handleSelectionInput(): void {
		if (this.input.consumeKeyPress('Escape')) {
			this.clearSelection();
			this.clearSelectionDrag();
			return;
		}

		if (this.input.consumeButtonPress(0)) {
			this.clearSelectionDrag();
			this.selectionClickBlockId = this.state.hoverHit?.block.id ?? null;
			this.selectionConnectedAppend =
				this.isConnectedSelectionModifierDown() && this.selectionClickBlockId !== null;

			if (this.selectionConnectedAppend) {
				this.selectionOperation = 'add';
				this.selectionDragStartCell = null;
				this.selectionWasDragged = false;
				this.state.previewBox = null;
				return;
			}

			this.selectionOperation = this.resolveSelectionOperation();
			this.selectionDragStartCell = this.state.hoverHit ? { ...this.state.hoverHit.voxel } : null;
			this.selectionWasDragged = false;
			this.state.previewBox = this.selectionDragStartCell
				? createPreviewBox(this.selectionDragStartCell, this.selectionDragStartCell)
				: null;
			this.captureInteractionPose();
		}

		if (!this.selectionDragStartCell) {
			if (this.input.consumeButtonRelease(0)) {
				if (this.selectionConnectedAppend) {
					this.appendConnectedSelection(this.selectionClickBlockId);
				} else {
					this.applySelectionClick(this.selectionClickBlockId);
				}

				this.clearSelectionDrag();
			}
			return;
		}

		if (this.input.isButtonDown(0) && this.state.hoverHit) {
			this.state.previewBox = createPreviewBox(
				this.selectionDragStartCell,
				this.state.hoverHit.voxel
			);
			this.selectionWasDragged =
				this.selectionWasDragged ||
				!areWorldCoordsEqual(this.selectionDragStartCell, this.state.hoverHit.voxel);
			this.captureInteractionPose();
		}

		if (!this.input.isButtonDown(0) && this.input.consumeButtonRelease(0)) {
			if (this.selectionWasDragged && this.state.previewBox) {
				this.applySelectionBox(this.state.previewBox, this.selectionOperation);
			} else {
				this.applySelectionClick(this.selectionClickBlockId);
			}

			this.clearSelectionDrag();
		}
	}

	private handlePropPlacementInput(): void {
		if (!this.activePropPlacement) {
			return;
		}

		if (this.input.consumeKeyPress('KeyW')) {
			this.transformControls.setMode('translate');
			setPropPlacementTransformMode('translate');
		}

		if (this.input.consumeKeyPress('KeyE')) {
			this.transformControls.setMode('rotate');
			setPropPlacementTransformMode('rotate');
		}

		if (this.input.consumeKeyPress('Escape')) {
			this.cancelPropPlacement();
			return;
		}

		if (this.input.consumeKeyPress('KeyP')) {
			this.cancelPropPlacement(true);
			return;
		}

		if (this.input.consumeKeyPress('Enter') || this.input.consumeKeyPress('NumpadEnter')) {
			this.confirmPropPlacement();
		}
	}

	private updatePreviewState(): void {
		const natureState = getNatureUiState();
		const grassAnchor =
			this.state.enabled &&
			!this.state.selectionEnabled &&
			!this.activePropPlacement &&
			this.state.activeTool === 'nature-grass'
				? resolveNatureGroundAnchor(this.world, this.state.hoverHit)
				: null;
		const treePreview =
			this.state.enabled &&
			!this.state.selectionEnabled &&
			!this.activePropPlacement &&
			this.state.activeTool === 'nature-tree'
				? buildNatureTreePreview(
						this.world,
						this.player,
						this.state.hoverHit,
						natureState.treeSettings
					)
				: null;
		const placementBox =
			this.state.enabled && !this.state.selectionEnabled && !this.isNatureToolActive()
				? this.getPlacementTargetBox()
				: null;
		const showBoxPreview =
			this.state.enabled &&
			!this.activePropPlacement &&
			!this.isNatureToolActive() &&
			!!this.state.previewBox &&
			(!this.state.selectionEnabled || this.selectionWasDragged);

		this.targetHighlight.visible =
			this.state.enabled &&
			!this.state.selectionEnabled &&
			!this.activePropPlacement &&
			placementBox !== null;
		this.boxPreviewWireframe.visible = showBoxPreview;
		this.boxPreviewGhost.visible = showBoxPreview;
		this.selectionRoot.visible = this.selectedBlockIds.size > 0 && !this.activePropPlacement;
		this.propPlacementRoot.visible = this.activePropPlacement !== null;
		this.natureBrushRoot.visible = grassAnchor !== null;
		this.natureTreePreviewRoot.visible = !!treePreview?.anchor;
		this.transformControlsHelper.visible = this.activePropPlacement !== null;
		this.transformControls.enabled = this.activePropPlacement !== null;

		if (placementBox) {
			positionBoxPreview(this.targetHighlight, placementBox, 1.01);
			setPreviewColor(this.targetHighlight, this.getModeColor());
		}

		if (showBoxPreview && this.state.previewBox) {
			positionBoxPreview(this.boxPreviewWireframe, this.state.previewBox, 1.01);
			positionBoxPreview(this.boxPreviewGhost, this.state.previewBox, 1);

			const previewColor = this.state.selectionEnabled ? SELECT_COLOR : this.getModeColor();
			setPreviewColor(this.boxPreviewWireframe, previewColor);
			setPreviewColor(this.boxPreviewGhost, previewColor);
		}

		if (grassAnchor) {
			const brushScale = natureState.grassSettings.radius + 0.58;
			this.natureBrushRoot.position.set(
				grassAnchor.x + 0.5,
				grassAnchor.surfaceY + 1.02,
				grassAnchor.z + 0.5
			);
			this.natureBrushRoot.scale.setScalar(brushScale);
		}

		if (treePreview) {
			this.syncNatureTreePreview(treePreview);
		} else {
			clearGroupChildren(this.natureTreePreviewRoot);
			this.lastNatureTreePreviewSignature = null;
		}
	}

	private resolveActiveTool(): EditorTool {
		if (this.isNatureToolActive()) {
			return this.natureTool;
		}

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
		for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
			const keyNumber = slotIndex + 1;
			const digitPressed = this.input.consumeKeyPress(`Digit${keyNumber}`);
			const numpadPressed = this.input.consumeKeyPress(`Numpad${keyNumber}`);

			if (!digitPressed && !numpadPressed) {
				continue;
			}

			const materialId = getHotbarMaterialId(slotIndex);

			if (materialId !== null && isSelectableVoxelMaterial(materialId)) {
				this.state.selectedVoxelId = materialId;
			}

			return;
		}
	}

	private resolveSelectionOperation(): SelectionOperation {
		if (this.input.isKeyDown('AltLeft') || this.input.isKeyDown('AltRight')) {
			return 'subtract';
		}

		if (this.input.isShiftDown()) {
			return 'add';
		}

		return 'replace';
	}

	private isConnectedSelectionModifierDown(): boolean {
		return (
			this.input.isKeyDown('ControlLeft') ||
			this.input.isKeyDown('ControlRight') ||
			this.input.isKeyDown('MetaLeft') ||
			this.input.isKeyDown('MetaRight')
		);
	}

	private applySelectionClick(blockId: VoxelBlockId | null): void {
		if (blockId === null) {
			return;
		}

		let changed = false;

		if (this.selectionOperation === 'add') {
			if (!this.selectedBlockIds.has(blockId)) {
				this.selectedBlockIds.add(blockId);
				changed = true;
			}
		} else if (this.selectionOperation === 'subtract') {
			changed = this.selectedBlockIds.delete(blockId);
		} else if (this.selectedBlockIds.has(blockId)) {
			this.selectedBlockIds.delete(blockId);
			changed = true;
		} else {
			this.selectedBlockIds.add(blockId);
			changed = true;
		}

		if (changed) {
			this.refreshSelectionHighlights();
		}
	}

	private appendConnectedSelection(blockId: VoxelBlockId | null): void {
		if (blockId === null) {
			return;
		}

		const block = this.world.blocks.get(blockId);

		if (!block) {
			return;
		}

		let changed = false;

		for (const connectedBlockId of collectConnectedMatchingBlockIds(this.world, block)) {
			if (this.selectedBlockIds.has(connectedBlockId)) {
				continue;
			}

			this.selectedBlockIds.add(connectedBlockId);
			changed = true;
		}

		if (changed) {
			this.refreshSelectionHighlights();
		}
	}

	private applySelectionBox(box: WorldBox, operation: SelectionOperation): void {
		const blockIds = collectBlockIdsInSelectionBox(this.world, box);
		let changed = false;

		if (operation === 'replace') {
			const nextSelected = new Set(blockIds);

			if (!areBlockIdSetsEqual(this.selectedBlockIds, nextSelected)) {
				this.selectedBlockIds.clear();

				for (const blockId of nextSelected) {
					this.selectedBlockIds.add(blockId);
				}

				changed = true;
			}
		} else if (operation === 'add') {
			for (const blockId of blockIds) {
				if (!this.selectedBlockIds.has(blockId)) {
					this.selectedBlockIds.add(blockId);
					changed = true;
				}
			}
		} else {
			for (const blockId of blockIds) {
				if (this.selectedBlockIds.delete(blockId)) {
					changed = true;
				}
			}
		}

		if (changed) {
			this.refreshSelectionHighlights();
		}
	}

	private pruneSelection(): void {
		let changed = false;

		for (const blockId of [...this.selectedBlockIds]) {
			if (this.world.blocks.has(blockId)) {
				continue;
			}

			this.selectedBlockIds.delete(blockId);
			changed = true;
		}

		if (changed) {
			this.refreshSelectionHighlights();
		}
	}

	private clearSelection(): void {
		if (this.selectedBlockIds.size === 0) {
			return;
		}

		this.selectedBlockIds.clear();
		this.refreshSelectionHighlights();
	}

	private refreshSelectionHighlights(): void {
		clearGroupChildren(this.selectionRoot);

		for (const blockId of this.selectedBlockIds) {
			const block = this.world.blocks.get(blockId);

			if (!block) {
				continue;
			}

			this.selectionRoot.add(
				createSelectionPreviewBlock(
					block.origin,
					block.size,
					this.selectionBoxGeometry,
					this.selectionEdgesGeometry,
					this.selectionFillMaterial,
					this.selectionWireMaterial
				)
			);
		}

		this.selectionRoot.visible = this.selectedBlockIds.size > 0;
	}

	private getSuggestedPropPlacementOrigin(prop: PropDefinition): WorldCoord {
		const footprintX = prop.bounds.max.x - prop.bounds.min.x + 1;
		const footprintZ = prop.bounds.max.z - prop.bounds.min.z + 1;
		const forward = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
		const preferredDistance =
			this.player.collider.halfWidth +
			Math.max(footprintX, footprintZ) * 0.5 +
			Math.max(6, DEFAULT_VOXEL_SIZE * 1.5);
		const center = this.player.position.clone().add(forward.multiplyScalar(preferredDistance));
		const baseOrigin = {
			x: Math.round(center.x - footprintX * 0.5 - prop.bounds.min.x),
			y: Math.round(this.player.position.y),
			z: Math.round(center.z - footprintZ * 0.5 - prop.bounds.min.z)
		};
		let bestOrigin: WorldCoord | null = null;
		let bestSupportGap = Number.POSITIVE_INFINITY;
		let bestVerticalOffset = Number.POSITIVE_INFINITY;

		for (const verticalOffset of createVerticalSearchOrder(48)) {
			const candidateOrigin = {
				x: baseOrigin.x,
				y: baseOrigin.y + verticalOffset,
				z: baseOrigin.z
			};
			const resolvedBlocks = resolvePropDefinitionBlocks(prop, candidateOrigin, {
				x: 0,
				y: 0,
				z: 0
			});

			if (!this.canPlacePropBlocks(resolvedBlocks)) {
				continue;
			}

			const supportGap = getPropSupportGap(this.world, resolvedBlocks);
			const absoluteOffset = Math.abs(verticalOffset);

			if (
				supportGap < bestSupportGap ||
				(supportGap === bestSupportGap && absoluteOffset < bestVerticalOffset)
			) {
				bestOrigin = candidateOrigin;
				bestSupportGap = supportGap;
				bestVerticalOffset = absoluteOffset;
			}

			if (supportGap === 0 && verticalOffset >= 0) {
				break;
			}
		}

		return bestOrigin ?? baseOrigin;
	}

	private rebuildPropPlacementPreview(prop: PropDefinition): void {
		clearGroupChildren(this.propPlacementRoot);

		for (const block of prop.blocks) {
			this.propPlacementRoot.add(
				createPropPlacementPreviewBlock(
					block.origin,
					block.size,
					this.propPlacementBoxGeometry,
					this.propPlacementEdgesGeometry,
					this.propPlacementFillMaterial,
					this.propPlacementWireMaterial
				)
			);
		}
	}

	private syncPropPlacementFromRoot(): void {
		if (!this.activePropPlacement) {
			return;
		}

		const origin = worldVectorToWorldCoord(this.propPlacementRoot.position);
		const rotationQuarterTurns = normalizeQuarterTurns({
			x: Math.round(this.propPlacementRoot.rotation.x / (Math.PI * 0.5)),
			y: Math.round(this.propPlacementRoot.rotation.y / (Math.PI * 0.5)),
			z: Math.round(this.propPlacementRoot.rotation.z / (Math.PI * 0.5))
		});

		this.propPlacementRoot.position.copy(worldCoordToWorldVector(origin));
		this.propPlacementRoot.rotation.set(
			rotationQuarterTurns.x * Math.PI * 0.5,
			rotationQuarterTurns.y * Math.PI * 0.5,
			rotationQuarterTurns.z * Math.PI * 0.5,
			'XYZ'
		);

		const resolvedBlocks = resolvePropDefinitionBlocks(
			this.activePropPlacement.prop,
			origin,
			rotationQuarterTurns
		);
		const valid = this.canPlacePropBlocks(resolvedBlocks);

		this.activePropPlacement.origin = origin;
		this.activePropPlacement.rotationQuarterTurns = rotationQuarterTurns;
		this.activePropPlacement.resolvedBlocks = resolvedBlocks;
		this.activePropPlacement.valid = valid;
		this.setPropPlacementPreviewColor(valid ? PROP_VALID_COLOR : PROP_INVALID_COLOR);
	}

	private canPlacePropBlocks(blocks: ReadonlyArray<PropDefinitionBlock>): boolean {
		for (const block of blocks) {
			if (
				!Number.isInteger(block.origin.x) ||
				!Number.isInteger(block.origin.y) ||
				!Number.isInteger(block.origin.z) ||
				!Number.isInteger(block.size) ||
				block.size < 1 ||
				!this.world.canPlaceBlockIgnoringWater(block.origin, block.size) ||
				!this.player.canPlaceBlockAt(block.origin, block.size)
			) {
				return false;
			}
		}

		return true;
	}

	private setPropPlacementPreviewColor(color: THREE.Color): void {
		this.propPlacementFillMaterial.color.copy(color);
		this.propPlacementWireMaterial.color.copy(color);
	}

	private confirmPropPlacement(): void {
		if (!this.activePropPlacement || !this.activePropPlacement.valid) {
			return;
		}

		this.captureUndoSnapshot();
		const result = createVoxelCommandResult();
		const displacedWaterBlocks = new Map<number, VoxelBlock>();

		for (const block of this.activePropPlacement.resolvedBlocks) {
			for (const waterBlock of this.world.getOverlappingWaterBlocks(block.origin, block.size)) {
				displacedWaterBlocks.set(waterBlock.id, waterBlock);
			}
		}

		const placed = this.world.placePropInstance(
			this.activePropPlacement.prop.id,
			this.activePropPlacement.origin,
			this.activePropPlacement.rotationQuarterTurns,
			this.activePropPlacement.resolvedBlocks,
			{ displaceWater: true }
		);

		if (!placed) {
			this.pendingUndoSnapshot = null;
			this.hasCommittedPendingUndo = false;
			this.syncPropPlacementFromRoot();
			return;
		}

		for (const block of this.activePropPlacement.resolvedBlocks) {
			this.world.collectAffectedChunkKeysForBlock(
				block.origin,
				block.size,
				result.affectedChunkKeys
			);
			result.changedVoxelCount += block.size ** 3;
		}

		for (const waterBlock of displacedWaterBlocks.values()) {
			this.world.collectAffectedChunkKeysForBlock(
				waterBlock.origin,
				waterBlock.size,
				result.affectedChunkKeys
			);
			result.changedVoxelCount += waterBlock.size ** 3;
		}

		this.commitPendingUndoSnapshot();

		for (const chunkKey of result.affectedChunkKeys) {
			this.pendingChunkKeys.add(chunkKey);
		}

		this.cancelPropPlacement();
	}

	private syncNatureTreePreview(preview: NatureTreePreview): void {
		if (preview.signature !== this.lastNatureTreePreviewSignature) {
			clearGroupChildren(this.natureTreePreviewRoot);

			for (const block of preview.blocks) {
				this.natureTreePreviewRoot.add(
					createNaturePreviewBlock(
						block.origin,
						this.natureTreePreviewBoxGeometry,
						this.natureTreePreviewEdgesGeometry,
						this.natureTreePreviewFillMaterial,
						this.natureTreePreviewWireMaterial
					)
				);
			}

			this.lastNatureTreePreviewSignature = preview.signature;
		}

		const previewColor = preview.valid ? NATURE_PREVIEW_COLOR : NATURE_INVALID_COLOR;
		this.natureTreePreviewFillMaterial.color.copy(previewColor);
		this.natureTreePreviewWireMaterial.color.copy(previewColor);
	}

	private cancelPropPlacement(reopenManager = false): void {
		this.activePropPlacement = null;
		this.transformControls.detach();
		this.transformControls.enabled = false;
		this.transformControlsHelper.visible = false;
		this.propPlacementRoot.visible = false;
		clearPropPlacement();
		this.pendingUndoSnapshot = null;
		this.hasCommittedPendingUndo = false;

		if (reopenManager) {
			openPropManager();
		}
	}

	private isNatureToolActive(): boolean {
		return this.state.activeTool === 'nature-grass' || this.state.activeTool === 'nature-tree';
	}

	private clearSelectionDrag(): void {
		this.selectionDragStartCell = null;
		this.selectionClickBlockId = null;
		this.selectionOperation = 'replace';
		this.selectionConnectedAppend = false;
		this.selectionWasDragged = false;
		this.state.previewBox = null;
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
		if (this.isNatureToolActive()) {
			return false;
		}

		if (isBoxTool(this.state.activeTool)) {
			return true;
		}

		return this.input.isShiftDown();
	}

	private getModeColor(): THREE.Color {
		if (this.state.selectionEnabled) {
			return SELECT_COLOR;
		}

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
		if (this.isNatureToolActive()) {
			return null;
		}

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
		this.pendingUndoSnapshot = {
			blocks: cloneWorldSnapshot(this.world.getBlocks()),
			propInstances: clonePropInstanceSnapshot(this.world.getPropInstances()),
			palette: clonePaletteStateSnapshot(createSerializedVoxelPaletteState()),
			props: clonePropLibraryStateSnapshot(createSerializedPropLibraryState())
		};
		this.hasCommittedPendingUndo = false;
	}

	private commitPendingUndoSnapshot(): void {
		if (!this.pendingUndoSnapshot || this.hasCommittedPendingUndo) {
			return;
		}

		this.undoStack.push(cloneProjectSnapshot(this.pendingUndoSnapshot));

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
		this.clearSelectionDrag();
		this.pendingChunkKeys.clear();

		if (!this.applyWorldSnapshot(cloneProjectSnapshot(snapshot))) {
			this.undoStack.push(snapshot);
		}
	}

	private readonly handleTransformObjectChange = (): void => {
		this.syncPropPlacementFromRoot();
		this.updatePreviewState();
	};
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

function createSelectionPreviewBlock(
	origin: WorldCoord,
	size: number,
	boxGeometry: THREE.BoxGeometry,
	edgesGeometry: THREE.EdgesGeometry,
	fillMaterial: THREE.MeshBasicMaterial,
	wireMaterial: THREE.LineBasicMaterial
): THREE.Group {
	const group = new THREE.Group();
	const mesh = new THREE.Mesh(boxGeometry, fillMaterial);
	const wireframe = new THREE.LineSegments(edgesGeometry, wireMaterial);

	group.add(mesh, wireframe);
	group.position.set(origin.x + size * 0.5, origin.y + size * 0.5, origin.z + size * 0.5);
	group.scale.set(size, size, size);
	group.renderOrder = 18;
	return group;
}

function createPropPlacementPreviewBlock(
	origin: WorldCoord,
	size: number,
	boxGeometry: THREE.BoxGeometry,
	edgesGeometry: THREE.EdgesGeometry,
	fillMaterial: THREE.MeshBasicMaterial,
	wireMaterial: THREE.LineBasicMaterial
): THREE.Group {
	const group = new THREE.Group();
	const mesh = new THREE.Mesh(boxGeometry, fillMaterial);
	const wireframe = new THREE.LineSegments(edgesGeometry, wireMaterial);
	const scaledSize = size * VOXEL_WORLD_SIZE;
	const halfSize = scaledSize * 0.5;

	group.add(mesh, wireframe);
	group.position.set(
		origin.x * VOXEL_WORLD_SIZE + halfSize,
		origin.y * VOXEL_WORLD_SIZE + halfSize,
		origin.z * VOXEL_WORLD_SIZE + halfSize
	);
	group.scale.setScalar(scaledSize);
	group.renderOrder = 21;
	return group;
}

function createNaturePreviewBlock(
	origin: WorldCoord,
	boxGeometry: THREE.BoxGeometry,
	edgesGeometry: THREE.EdgesGeometry,
	fillMaterial: THREE.MeshBasicMaterial,
	wireMaterial: THREE.LineBasicMaterial
): THREE.Group {
	const group = new THREE.Group();
	const mesh = new THREE.Mesh(boxGeometry, fillMaterial);
	const wireframe = new THREE.LineSegments(edgesGeometry, wireMaterial);

	group.add(mesh, wireframe);
	group.position.set(origin.x + 0.5, origin.y + 0.5, origin.z + 0.5);
	group.scale.setScalar(1);
	group.renderOrder = 20;
	return group;
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

function clearGroupChildren(group: THREE.Group): void {
	for (const child of [...group.children]) {
		group.remove(child);
	}
}

function collectBlockIdsInSelectionBox(world: VoxelWorld, box: WorldBox): Set<VoxelBlockId> {
	const blockIds = new Set<VoxelBlockId>();

	for (const block of world.blocks.values()) {
		const blockMaxX = block.origin.x + block.size - 1;
		const blockMaxY = block.origin.y + block.size - 1;
		const blockMaxZ = block.origin.z + block.size - 1;
		const intersects =
			block.origin.x <= box.max.x &&
			blockMaxX >= box.min.x &&
			block.origin.y <= box.max.y &&
			blockMaxY >= box.min.y &&
			block.origin.z <= box.max.z &&
			blockMaxZ >= box.min.z;

		if (intersects) {
			blockIds.add(block.id);
		}
	}

	return blockIds;
}

function collectConnectedMatchingBlockIds(
	world: VoxelWorld,
	startBlock: Pick<VoxelBlock, 'id' | 'materialId' | 'origin' | 'size'>
): Set<VoxelBlockId> {
	const visited = new Set<VoxelBlockId>([startBlock.id]);
	const queue: VoxelBlockId[] = [startBlock.id];

	while (queue.length > 0) {
		const currentBlockId = queue.shift();

		if (currentBlockId === undefined) {
			continue;
		}

		const currentBlock = world.blocks.get(currentBlockId);

		if (!currentBlock) {
			continue;
		}

		for (const neighborBlockId of getMatchingNeighborBlockIds(world, currentBlock)) {
			if (visited.has(neighborBlockId)) {
				continue;
			}

			visited.add(neighborBlockId);
			queue.push(neighborBlockId);
		}
	}

	return visited;
}

function getMatchingNeighborBlockIds(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'id' | 'materialId' | 'origin' | 'size'>
): Set<VoxelBlockId> {
	const neighborIds = new Set<VoxelBlockId>();

	for (let z = block.origin.z; z < block.origin.z + block.size; z += 1) {
		for (let y = block.origin.y; y < block.origin.y + block.size; y += 1) {
			collectMatchingNeighborBlockId(world, block, block.origin.x - 1, y, z, neighborIds);
			collectMatchingNeighborBlockId(world, block, block.origin.x + block.size, y, z, neighborIds);
		}
	}

	for (let z = block.origin.z; z < block.origin.z + block.size; z += 1) {
		for (let x = block.origin.x; x < block.origin.x + block.size; x += 1) {
			collectMatchingNeighborBlockId(world, block, x, block.origin.y - 1, z, neighborIds);
			collectMatchingNeighborBlockId(world, block, x, block.origin.y + block.size, z, neighborIds);
		}
	}

	for (let y = block.origin.y; y < block.origin.y + block.size; y += 1) {
		for (let x = block.origin.x; x < block.origin.x + block.size; x += 1) {
			collectMatchingNeighborBlockId(world, block, x, y, block.origin.z - 1, neighborIds);
			collectMatchingNeighborBlockId(world, block, x, y, block.origin.z + block.size, neighborIds);
		}
	}

	return neighborIds;
}

function collectMatchingNeighborBlockId(
	world: VoxelWorld,
	block: Pick<VoxelBlock, 'id' | 'materialId' | 'size'>,
	x: number,
	y: number,
	z: number,
	neighborIds: Set<VoxelBlockId>
): void {
	const neighborBlock = world.getBlockAt(x, y, z);

	if (
		!neighborBlock ||
		neighborBlock.id === block.id ||
		neighborBlock.materialId !== block.materialId ||
		neighborBlock.size !== block.size
	) {
		return;
	}

	neighborIds.add(neighborBlock.id);
}

function areBlockIdSetsEqual(a: ReadonlySet<VoxelBlockId>, b: ReadonlySet<VoxelBlockId>): boolean {
	if (a.size !== b.size) {
		return false;
	}

	for (const value of a) {
		if (!b.has(value)) {
			return false;
		}
	}

	return true;
}

function areWorldCoordsEqual(a: WorldCoord, b: WorldCoord): boolean {
	return a.x === b.x && a.y === b.y && a.z === b.z;
}

function worldCoordToWorldVector(coord: WorldCoord): THREE.Vector3 {
	return new THREE.Vector3(
		coord.x * VOXEL_WORLD_SIZE,
		coord.y * VOXEL_WORLD_SIZE,
		coord.z * VOXEL_WORLD_SIZE
	);
}

function worldVectorToWorldCoord(vector: THREE.Vector3): WorldCoord {
	return {
		x: Math.round(vector.x / VOXEL_WORLD_SIZE),
		y: Math.round(vector.y / VOXEL_WORLD_SIZE),
		z: Math.round(vector.z / VOXEL_WORLD_SIZE)
	};
}

function createVerticalSearchOrder(maxOffset: number): number[] {
	const offsets = [0];

	for (let offset = 1; offset <= maxOffset; offset += 1) {
		offsets.push(-offset, offset);
	}

	return offsets;
}

function getPropSupportGap(world: VoxelWorld, blocks: ReadonlyArray<PropDefinitionBlock>): number {
	const bottomByColumn = new Map<string, number>();

	for (const block of blocks) {
		for (let z = block.origin.z; z < block.origin.z + block.size; z += 1) {
			for (let x = block.origin.x; x < block.origin.x + block.size; x += 1) {
				const columnKey = `${x},${z}`;
				const currentBottom = bottomByColumn.get(columnKey);

				if (currentBottom === undefined || block.origin.y < currentBottom) {
					bottomByColumn.set(columnKey, block.origin.y);
				}
			}
		}
	}

	let bestGap = Number.POSITIVE_INFINITY;

	for (const [columnKey, bottomY] of bottomByColumn) {
		const [xText, zText] = columnKey.split(',');
		const x = Number.parseInt(xText ?? '0', 10);
		const z = Number.parseInt(zText ?? '0', 10);

		for (let y = bottomY - 1, gap = 0; gap <= 64; y -= 1, gap += 1) {
			if (world.getVoxel(x, y, z) === VOXEL_AIR) {
				continue;
			}

			bestGap = Math.min(bestGap, gap);
			break;
		}
	}

	return bestGap;
}

function cloneProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
	return {
		blocks: cloneWorldSnapshot(snapshot.blocks),
		propInstances: clonePropInstanceSnapshot(snapshot.propInstances),
		palette: clonePaletteStateSnapshot(snapshot.palette),
		props: clonePropLibraryStateSnapshot(snapshot.props)
	};
}

function cloneWorldSnapshot(blocks: WorldSnapshot): SerializedWorldBlock[] {
	return blocks.map((block) => ({
		materialId: block.materialId,
		origin: { ...block.origin },
		size: block.size,
		propInstanceId: block.propInstanceId
	}));
}

function clonePropInstanceSnapshot(
	propInstances: PropInstanceSnapshot
): SerializedWorldPropInstance[] {
	return propInstances.map((propInstance) => ({
		id: propInstance.id,
		propId: propInstance.propId,
		origin: { ...propInstance.origin },
		rotationQuarterTurns: { ...propInstance.rotationQuarterTurns }
	}));
}

function clonePaletteStateSnapshot(
	state: SerializedVoxelPaletteState
): SerializedVoxelPaletteState {
	return {
		materials: state.materials.map((material) => ({
			id: material.id,
			name: material.name,
			color: [...material.color] as [number, number, number],
			opacity: material.opacity,
			isWater: material.isWater ?? false,
			emitsLight: material.emitsLight ?? false,
			lightTint: [...(material.lightTint ?? material.color)] as [number, number, number],
			archived: material.archived
		})),
		hotbar: [...state.hotbar]
	};
}

function clonePropLibraryStateSnapshot(
	state: SerializedPropLibraryState
): SerializedPropLibraryState {
	return {
		props: state.props.map((prop) => ({
			id: prop.id,
			name: prop.name,
			interactable: prop.interactable,
			blocks: prop.blocks.map((block) => ({
				materialId: block.materialId,
				origin: { ...block.origin },
				size: block.size
			})),
			bounds: {
				min: { ...prop.bounds.min },
				max: { ...prop.bounds.max }
			}
		}))
	};
}
