import * as THREE from 'three';

import type { TimeOfDay } from '$lib/engine/scene';
import { CHUNK_SIZE, VOXEL_AIR, VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import {
	doesVoxelEmitLight,
	getVoxelColor,
	getVoxelLightTint,
	getVoxelOpacity,
	isWaterVoxelMaterial
} from '$lib/voxel/voxelPalette';
import type { ChunkKey } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const GI_VOLUME_WIDTH = 32;
const GI_VOLUME_HEIGHT = 16;
const GI_VOLUME_DEPTH = 32;
const GI_VOLUME_CELL_COUNT = GI_VOLUME_WIDTH * GI_VOLUME_HEIGHT * GI_VOLUME_DEPTH;
const GI_TRACE_STEP = 1;
const GI_SUN_TRACE_STEP = 2;
const GI_HISTORY_BLEND = 0.35;
const GI_PREFILL_RADIUS_XZ = 4;
const GI_PREFILL_RADIUS_Y = 2;
const GI_SCROLL_MARGIN_XZ = 6;
const GI_SCROLL_MARGIN_Y = 3;
const DIAGONAL_TRACE_DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
	[0.5773502692, 0.5773502692, 0.5773502692],
	[-0.5773502692, 0.5773502692, 0.5773502692],
	[0.5773502692, 0.5773502692, -0.5773502692],
	[-0.5773502692, 0.5773502692, -0.5773502692],
	[0.5773502692, -0.5773502692, 0.5773502692],
	[-0.5773502692, -0.5773502692, 0.5773502692],
	[0.5773502692, -0.5773502692, -0.5773502692],
	[-0.5773502692, -0.5773502692, -0.5773502692]
];
const AXIS_TRACE_DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];

export type VoxelGiProfileName = 'default' | 'stress';

interface VoxelGiProfile {
	cellSize: number;
	traceDistance: number;
	traceDirections: ReadonlyArray<readonly [number, number, number]>;
	updateProbesPerFrame: number;
	updateBudgetMs: number;
	intensity: number;
	classicBounceScale: number;
	visibilityFloor: number;
}

const GI_PROFILES: Record<VoxelGiProfileName, VoxelGiProfile> = {
	default: {
		cellSize: 32,
		traceDistance: 48,
		traceDirections: DIAGONAL_TRACE_DIRECTIONS,
		updateProbesPerFrame: 96,
		updateBudgetMs: 2.5,
		intensity: 0.88,
		classicBounceScale: 0.26,
		visibilityFloor: 0.18
	},
	stress: {
		cellSize: 16,
		traceDistance: 128,
		traceDirections: [...DIAGONAL_TRACE_DIRECTIONS, ...AXIS_TRACE_DIRECTIONS],
		updateProbesPerFrame: 192,
		updateBudgetMs: 5,
		intensity: 2.4,
		classicBounceScale: 0.02,
		visibilityFloor: 0.05
	}
};

export interface VoxelGiLightingState {
	skyColor: THREE.Color;
	groundColor: THREE.Color;
	sunColor: THREE.Color;
	sunDirection: THREE.Vector3;
	sunIntensity: number;
	timeOfDay: TimeOfDay;
}

export interface VoxelGiUniformState {
	enabled: boolean;
	atlas: THREE.DataTexture;
	atlasSize: THREE.Vector2;
	worldOrigin: THREE.Vector3;
	volumeSize: THREE.Vector3;
	cellSize: number;
	intensity: number;
	classicBounceScale: number;
	visibilityFloor: number;
}

interface ResolvedLightingState {
	sky: [number, number, number];
	ground: [number, number, number];
	sun: [number, number, number];
	sunDirection: [number, number, number];
	sunIntensity: number;
	timeOfDay: TimeOfDay;
}

interface TraceResult {
	light: [number, number, number];
	visibility: number;
}

export class VoxelGiSystem {
	private readonly probeData = new Uint8Array(GI_VOLUME_CELL_COUNT * 4);
	private readonly scratchProbeData = new Uint8Array(GI_VOLUME_CELL_COUNT * 4);
	private readonly dirtyFlags = new Uint8Array(GI_VOLUME_CELL_COUNT);
	private readonly dirtyQueue: number[] = [];
	private readonly lightingState: ResolvedLightingState = {
		sky: [0.83, 0.9, 0.95],
		ground: [0.45, 0.4, 0.36],
		sun: [1, 0.91, 0.76],
		sunDirection: [0.42, 0.84, 0.34],
		sunIntensity: 2,
		timeOfDay: 'day'
	};
	private readonly uniformState: VoxelGiUniformState;
	private readonly traceResult: TraceResult = {
		light: [0, 0, 0],
		visibility: 1
	};
	private profileName: VoxelGiProfileName = 'default';
	private profile: VoxelGiProfile = GI_PROFILES.default;
	private volumeOriginX = 0;
	private volumeOriginY = 0;
	private volumeOriginZ = 0;
	private initialized = false;
	private pendingFullReset = true;
	private enabled = true;

	constructor(private readonly world: VoxelWorld) {
		const atlas = new THREE.DataTexture(
			this.probeData,
			GI_VOLUME_WIDTH * GI_VOLUME_DEPTH,
			GI_VOLUME_HEIGHT,
			THREE.RGBAFormat,
			THREE.UnsignedByteType
		);

		atlas.name = 'VoxelGiAtlas';
		atlas.minFilter = THREE.LinearFilter;
		atlas.magFilter = THREE.LinearFilter;
		atlas.wrapS = THREE.ClampToEdgeWrapping;
		atlas.wrapT = THREE.ClampToEdgeWrapping;
		atlas.generateMipmaps = false;
		atlas.unpackAlignment = 1;
		atlas.needsUpdate = true;

		this.uniformState = {
			enabled: true,
			atlas,
			atlasSize: new THREE.Vector2(GI_VOLUME_WIDTH * GI_VOLUME_DEPTH, GI_VOLUME_HEIGHT),
			worldOrigin: new THREE.Vector3(),
			volumeSize: new THREE.Vector3(GI_VOLUME_WIDTH, GI_VOLUME_HEIGHT, GI_VOLUME_DEPTH),
			cellSize: 1,
			intensity: 0,
			classicBounceScale: 0.26,
			visibilityFloor: 0.18
		};
		this.applyProfileToUniformState();
	}

	getUniformState(): VoxelGiUniformState {
		this.uniformState.enabled = this.enabled;
		return this.uniformState;
	}

	setEnabled(enabled: boolean): void {
		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;

		if (enabled) {
			this.reset();
		}
	}

	setProfile(profileName: VoxelGiProfileName): void {
		if (this.profileName === profileName) {
			return;
		}

		this.profileName = profileName;
		this.profile = GI_PROFILES[profileName];
		this.applyProfileToUniformState();
		this.reset();
	}

	getEnabled(): boolean {
		return this.enabled;
	}

	reset(): void {
		this.pendingFullReset = true;
		this.initialized = false;
		this.probeData.fill(0);
		this.uniformState.atlas.needsUpdate = true;
		this.clearDirtyState();
	}

	invalidateAll(): void {
		if (!this.enabled) {
			return;
		}

		if (!this.initialized) {
			this.pendingFullReset = true;
			return;
		}

		for (let index = 0; index < GI_VOLUME_CELL_COUNT; index += 1) {
			this.markDirtyIndex(index);
		}
	}

	invalidateChunks(chunkKeys: Iterable<ChunkKey>): void {
		if (!this.enabled) {
			return;
		}

		if (!this.initialized) {
			this.pendingFullReset = true;
			return;
		}

		for (const chunkKey of chunkKeys) {
			const [chunkX, chunkY, chunkZ] = parseChunkKey(chunkKey);
			const minX = chunkX * CHUNK_SIZE - this.profile.traceDistance;
			const minY = chunkY * CHUNK_SIZE - this.profile.traceDistance;
			const minZ = chunkZ * CHUNK_SIZE - this.profile.traceDistance;
			const maxX = (chunkX + 1) * CHUNK_SIZE + this.profile.traceDistance;
			const maxY = (chunkY + 1) * CHUNK_SIZE + this.profile.traceDistance;
			const maxZ = (chunkZ + 1) * CHUNK_SIZE + this.profile.traceDistance;

			this.markDirtyVoxelBounds(minX, minY, minZ, maxX, maxY, maxZ);
		}
	}

	sync(cameraPosition: THREE.Vector3, lightingState: VoxelGiLightingState): void {
		this.applyLightingState(lightingState);

		if (!this.enabled) {
			return;
		}

		const cameraVoxelX = Math.floor(cameraPosition.x / VOXEL_WORLD_SIZE);
		const cameraVoxelY = Math.floor(cameraPosition.y / VOXEL_WORLD_SIZE);
		const cameraVoxelZ = Math.floor(cameraPosition.z / VOXEL_WORLD_SIZE);

		if (this.pendingFullReset || !this.initialized) {
			this.initializeVolume(cameraVoxelX, cameraVoxelY, cameraVoxelZ);
			this.prefillAroundCamera(cameraVoxelX, cameraVoxelY, cameraVoxelZ);
		} else {
			this.scrollVolumeIfNeeded(cameraVoxelX, cameraVoxelY, cameraVoxelZ);
		}

		this.processDirtyQueue();
	}

	dispose(): void {
		this.uniformState.atlas.dispose();
	}

	private applyProfileToUniformState(): void {
		this.uniformState.cellSize = this.profile.cellSize * VOXEL_WORLD_SIZE;
		this.uniformState.intensity = this.profile.intensity;
		this.uniformState.classicBounceScale = this.profile.classicBounceScale;
		this.uniformState.visibilityFloor = this.profile.visibilityFloor;
	}

	private applyLightingState(lightingState: VoxelGiLightingState): void {
		this.lightingState.sky = colorToTuple(lightingState.skyColor);
		this.lightingState.ground = colorToTuple(lightingState.groundColor);
		this.lightingState.sun = colorToTuple(lightingState.sunColor);
		this.lightingState.sunDirection = vectorToTuple(lightingState.sunDirection);
		this.lightingState.sunIntensity = lightingState.sunIntensity;
		this.lightingState.timeOfDay = lightingState.timeOfDay;
	}

	private initializeVolume(cameraVoxelX: number, cameraVoxelY: number, cameraVoxelZ: number): void {
		this.volumeOriginX = computeCenteredVolumeOrigin(
			cameraVoxelX,
			GI_VOLUME_WIDTH,
			this.profile.cellSize
		);
		this.volumeOriginY = computeCenteredVolumeOrigin(
			cameraVoxelY,
			GI_VOLUME_HEIGHT,
			this.profile.cellSize
		);
		this.volumeOriginZ = computeCenteredVolumeOrigin(
			cameraVoxelZ,
			GI_VOLUME_DEPTH,
			this.profile.cellSize
		);
		this.uniformState.worldOrigin.set(
			this.volumeOriginX * VOXEL_WORLD_SIZE,
			this.volumeOriginY * VOXEL_WORLD_SIZE,
			this.volumeOriginZ * VOXEL_WORLD_SIZE
		);
		this.probeData.fill(0);
		this.clearDirtyState();

		for (let index = 0; index < GI_VOLUME_CELL_COUNT; index += 1) {
			this.markDirtyIndex(index);
		}

		this.initialized = true;
		this.pendingFullReset = false;
		this.uniformState.atlas.needsUpdate = true;
	}

	private scrollVolumeIfNeeded(
		cameraVoxelX: number,
		cameraVoxelY: number,
		cameraVoxelZ: number
	): void {
		const cameraCellX = Math.floor((cameraVoxelX - this.volumeOriginX) / this.profile.cellSize);
		const cameraCellY = Math.floor((cameraVoxelY - this.volumeOriginY) / this.profile.cellSize);
		const cameraCellZ = Math.floor((cameraVoxelZ - this.volumeOriginZ) / this.profile.cellSize);
		const needsScroll =
			cameraCellX < GI_SCROLL_MARGIN_XZ ||
			cameraCellX >= GI_VOLUME_WIDTH - GI_SCROLL_MARGIN_XZ ||
			cameraCellY < GI_SCROLL_MARGIN_Y ||
			cameraCellY >= GI_VOLUME_HEIGHT - GI_SCROLL_MARGIN_Y ||
			cameraCellZ < GI_SCROLL_MARGIN_XZ ||
			cameraCellZ >= GI_VOLUME_DEPTH - GI_SCROLL_MARGIN_XZ;

		if (!needsScroll) {
			return;
		}

		const nextOriginX = computeCenteredVolumeOrigin(
			cameraVoxelX,
			GI_VOLUME_WIDTH,
			this.profile.cellSize
		);
		const nextOriginY = computeCenteredVolumeOrigin(
			cameraVoxelY,
			GI_VOLUME_HEIGHT,
			this.profile.cellSize
		);
		const nextOriginZ = computeCenteredVolumeOrigin(
			cameraVoxelZ,
			GI_VOLUME_DEPTH,
			this.profile.cellSize
		);
		const deltaX = (nextOriginX - this.volumeOriginX) / this.profile.cellSize;
		const deltaY = (nextOriginY - this.volumeOriginY) / this.profile.cellSize;
		const deltaZ = (nextOriginZ - this.volumeOriginZ) / this.profile.cellSize;

		if (
			!Number.isInteger(deltaX) ||
			!Number.isInteger(deltaY) ||
			!Number.isInteger(deltaZ) ||
			Math.abs(deltaX) >= GI_VOLUME_WIDTH ||
			Math.abs(deltaY) >= GI_VOLUME_HEIGHT ||
			Math.abs(deltaZ) >= GI_VOLUME_DEPTH
		) {
			this.pendingFullReset = true;
			this.initializeVolume(cameraVoxelX, cameraVoxelY, cameraVoxelZ);
			this.prefillAroundCamera(cameraVoxelX, cameraVoxelY, cameraVoxelZ);
			return;
		}

		this.scratchProbeData.fill(0);
		this.clearDirtyState();

		for (let z = 0; z < GI_VOLUME_DEPTH; z += 1) {
			for (let y = 0; y < GI_VOLUME_HEIGHT; y += 1) {
				for (let x = 0; x < GI_VOLUME_WIDTH; x += 1) {
					const sourceX = x + deltaX;
					const sourceY = y + deltaY;
					const sourceZ = z + deltaZ;
					const targetOffset = this.getAtlasOffset(x, y, z);

					if (
						sourceX < 0 ||
						sourceX >= GI_VOLUME_WIDTH ||
						sourceY < 0 ||
						sourceY >= GI_VOLUME_HEIGHT ||
						sourceZ < 0 ||
						sourceZ >= GI_VOLUME_DEPTH
					) {
						this.markDirtyIndex(this.getLinearIndex(x, y, z));
						continue;
					}

					const sourceOffset = this.getAtlasOffset(sourceX, sourceY, sourceZ);
					this.scratchProbeData[targetOffset] = this.probeData[sourceOffset];
					this.scratchProbeData[targetOffset + 1] = this.probeData[sourceOffset + 1];
					this.scratchProbeData[targetOffset + 2] = this.probeData[sourceOffset + 2];
					this.scratchProbeData[targetOffset + 3] = this.probeData[sourceOffset + 3];
				}
			}
		}

		this.probeData.set(this.scratchProbeData);
		this.volumeOriginX = nextOriginX;
		this.volumeOriginY = nextOriginY;
		this.volumeOriginZ = nextOriginZ;
		this.uniformState.worldOrigin.set(
			nextOriginX * VOXEL_WORLD_SIZE,
			nextOriginY * VOXEL_WORLD_SIZE,
			nextOriginZ * VOXEL_WORLD_SIZE
		);
		this.uniformState.atlas.needsUpdate = true;
	}

	private prefillAroundCamera(
		cameraVoxelX: number,
		cameraVoxelY: number,
		cameraVoxelZ: number
	): void {
		const centerX = Math.floor((cameraVoxelX - this.volumeOriginX) / this.profile.cellSize);
		const centerY = Math.floor((cameraVoxelY - this.volumeOriginY) / this.profile.cellSize);
		const centerZ = Math.floor((cameraVoxelZ - this.volumeOriginZ) / this.profile.cellSize);

		for (let z = centerZ - GI_PREFILL_RADIUS_XZ; z <= centerZ + GI_PREFILL_RADIUS_XZ; z += 1) {
			for (let y = centerY - GI_PREFILL_RADIUS_Y; y <= centerY + GI_PREFILL_RADIUS_Y; y += 1) {
				for (let x = centerX - GI_PREFILL_RADIUS_XZ; x <= centerX + GI_PREFILL_RADIUS_XZ; x += 1) {
					if (!this.isCellInBounds(x, y, z)) {
						continue;
					}

					const index = this.getLinearIndex(x, y, z);
					this.dirtyFlags[index] = 0;
					this.solveProbe(index);
				}
			}
		}

		this.uniformState.atlas.needsUpdate = true;
	}

	private processDirtyQueue(): void {
		const startTime = performance.now();
		let processedCount = 0;

		while (this.dirtyQueue.length > 0) {
			if (
				processedCount >= this.profile.updateProbesPerFrame ||
				performance.now() - startTime >= this.profile.updateBudgetMs
			) {
				break;
			}

			const index = this.dirtyQueue.pop();

			if (index === undefined || this.dirtyFlags[index] === 0) {
				continue;
			}

			this.dirtyFlags[index] = 0;
			this.solveProbe(index);
			processedCount += 1;
		}

		if (processedCount > 0) {
			this.uniformState.atlas.needsUpdate = true;
		}
	}

	private solveProbe(index: number): void {
		const { x, y, z } = this.getCellCoords(index);
		const probeCenterX = this.volumeOriginX + (x + 0.5) * this.profile.cellSize;
		const probeCenterY = this.volumeOriginY + (y + 0.5) * this.profile.cellSize;
		const probeCenterZ = this.volumeOriginZ + (z + 0.5) * this.profile.cellSize;
		let lightR = 0;
		let lightG = 0;
		let lightB = 0;
		let visibility = 0;

		for (const direction of this.profile.traceDirections) {
			const result = this.traceProbeRay(
				probeCenterX,
				probeCenterY,
				probeCenterZ,
				direction[0],
				direction[1],
				direction[2]
			);
			lightR += result.light[0];
			lightG += result.light[1];
			lightB += result.light[2];
			visibility += result.visibility;
		}

		const sampleCount = this.profile.traceDirections.length;
		const nextR = clamp01(lightR / sampleCount);
		const nextG = clamp01(lightG / sampleCount);
		const nextB = clamp01(lightB / sampleCount);
		const nextVisibility = clamp01(visibility / sampleCount);
		const atlasOffset = this.getAtlasOffset(x, y, z);
		const previousR = this.probeData[atlasOffset] / 255;
		const previousG = this.probeData[atlasOffset + 1] / 255;
		const previousB = this.probeData[atlasOffset + 2] / 255;
		const previousVisibility = this.probeData[atlasOffset + 3] / 255;
		const hasHistory = previousR > 0 || previousG > 0 || previousB > 0 || previousVisibility > 0;
		const blendFactor = hasHistory ? GI_HISTORY_BLEND : 0;

		this.probeData[atlasOffset] = Math.round(mix(nextR, previousR, blendFactor) * 255);
		this.probeData[atlasOffset + 1] = Math.round(mix(nextG, previousG, blendFactor) * 255);
		this.probeData[atlasOffset + 2] = Math.round(mix(nextB, previousB, blendFactor) * 255);
		this.probeData[atlasOffset + 3] = Math.round(
			mix(nextVisibility, previousVisibility, blendFactor) * 255
		);
	}

	private traceProbeRay(
		startX: number,
		startY: number,
		startZ: number,
		dirX: number,
		dirY: number,
		dirZ: number
	): TraceResult {
		for (
			let distance = GI_TRACE_STEP;
			distance <= this.profile.traceDistance;
			distance += GI_TRACE_STEP
		) {
			const sampleX = Math.floor(startX + dirX * distance);
			const sampleY = Math.floor(startY + dirY * distance);
			const sampleZ = Math.floor(startZ + dirZ * distance);
			const voxelId = this.world.getVoxel(sampleX, sampleY, sampleZ);

			if (
				voxelId === VOXEL_AIR ||
				isWaterVoxelMaterial(voxelId) ||
				getVoxelOpacity(voxelId) < 0.95
			) {
				continue;
			}

			const visibility = clamp01(distance / this.profile.traceDistance);

			if (doesVoxelEmitLight(voxelId)) {
				const lightTint = getVoxelLightTint(voxelId);

				this.traceResult.light[0] = lightTint[0] * 0.78;
				this.traceResult.light[1] = lightTint[1] * 0.78;
				this.traceResult.light[2] = lightTint[2] * 0.78;
				this.traceResult.visibility = visibility;
				return this.traceResult;
			}

			const bouncedLight = this.sampleBouncedLight(
				voxelId,
				sampleX,
				sampleY,
				sampleZ,
				-dirX,
				-dirY,
				-dirZ
			);

			this.traceResult.light[0] = bouncedLight[0];
			this.traceResult.light[1] = bouncedLight[1];
			this.traceResult.light[2] = bouncedLight[2];
			this.traceResult.visibility = visibility;
			return this.traceResult;
		}

		const skyLight = this.sampleSkyLight(dirX, dirY, dirZ);

		this.traceResult.light[0] = skyLight[0];
		this.traceResult.light[1] = skyLight[1];
		this.traceResult.light[2] = skyLight[2];
		this.traceResult.visibility = 1;
		return this.traceResult;
	}

	private sampleBouncedLight(
		voxelId: number,
		hitX: number,
		hitY: number,
		hitZ: number,
		normalX: number,
		normalY: number,
		normalZ: number
	): [number, number, number] {
		const surfaceColor = getVoxelColor(voxelId);
		const sunDot = Math.max(
			0,
			normalX * this.lightingState.sunDirection[0] +
				normalY * this.lightingState.sunDirection[1] +
				normalZ * this.lightingState.sunDirection[2]
		);
		const sunVisible =
			sunDot > 0.04 && this.lightingState.sunIntensity > 0.08
				? this.traceSunVisibility(hitX, hitY, hitZ, normalX, normalY, normalZ)
				: 0;
		const skyFactor = clamp01(normalY * 0.5 + 0.5);
		const groundFactor = clamp01(-normalY * 0.5 + 0.5);
		const incomingR =
			this.lightingState.sky[0] * (0.12 + skyFactor * 0.18) +
			this.lightingState.ground[0] * (0.05 + groundFactor * 0.08) +
			this.lightingState.sun[0] * this.lightingState.sunIntensity * sunDot * sunVisible * 0.22;
		const incomingG =
			this.lightingState.sky[1] * (0.12 + skyFactor * 0.18) +
			this.lightingState.ground[1] * (0.05 + groundFactor * 0.08) +
			this.lightingState.sun[1] * this.lightingState.sunIntensity * sunDot * sunVisible * 0.22;
		const incomingB =
			this.lightingState.sky[2] * (0.12 + skyFactor * 0.18) +
			this.lightingState.ground[2] * (0.05 + groundFactor * 0.08) +
			this.lightingState.sun[2] * this.lightingState.sunIntensity * sunDot * sunVisible * 0.22;

		return [
			clamp01(surfaceColor[0] * incomingR * 0.7),
			clamp01(surfaceColor[1] * incomingG * 0.7),
			clamp01(surfaceColor[2] * incomingB * 0.7)
		];
	}

	private traceSunVisibility(
		hitX: number,
		hitY: number,
		hitZ: number,
		normalX: number,
		normalY: number,
		normalZ: number
	): number {
		const sunX = this.lightingState.sunDirection[0];
		const sunY = this.lightingState.sunDirection[1];
		const sunZ = this.lightingState.sunDirection[2];
		const startX = hitX + normalX * 1.25;
		const startY = hitY + normalY * 1.25;
		const startZ = hitZ + normalZ * 1.25;

		for (
			let distance = GI_SUN_TRACE_STEP;
			distance <= this.profile.traceDistance;
			distance += GI_SUN_TRACE_STEP
		) {
			const sampleX = Math.floor(startX + sunX * distance);
			const sampleY = Math.floor(startY + sunY * distance);
			const sampleZ = Math.floor(startZ + sunZ * distance);
			const voxelId = this.world.getVoxel(sampleX, sampleY, sampleZ);

			if (
				voxelId !== VOXEL_AIR &&
				!isWaterVoxelMaterial(voxelId) &&
				getVoxelOpacity(voxelId) >= 0.95
			) {
				return 0;
			}
		}

		return 1;
	}

	private sampleSkyLight(dirX: number, dirY: number, dirZ: number): [number, number, number] {
		const horizon = clamp01(dirY * 0.5 + 0.5);
		const skyMix = smoothstep(0.18, 1, horizon);
		const baseR = mix(this.lightingState.ground[0], this.lightingState.sky[0], skyMix) * 0.2;
		const baseG = mix(this.lightingState.ground[1], this.lightingState.sky[1], skyMix) * 0.2;
		const baseB = mix(this.lightingState.ground[2], this.lightingState.sky[2], skyMix) * 0.2;
		const sunDot = Math.max(
			0,
			dirX * this.lightingState.sunDirection[0] +
				dirY * this.lightingState.sunDirection[1] +
				dirZ * this.lightingState.sunDirection[2]
		);
		const glowPower = this.lightingState.timeOfDay === 'night' ? 18 : 28;
		const glowAmount =
			Math.pow(sunDot, glowPower) *
			this.lightingState.sunIntensity *
			(this.lightingState.timeOfDay === 'night' ? 0.08 : 0.16);

		return [
			clamp01(baseR + this.lightingState.sun[0] * glowAmount),
			clamp01(baseG + this.lightingState.sun[1] * glowAmount),
			clamp01(baseB + this.lightingState.sun[2] * glowAmount)
		];
	}

	private markDirtyVoxelBounds(
		minX: number,
		minY: number,
		minZ: number,
		maxX: number,
		maxY: number,
		maxZ: number
	): void {
		const minCellX = Math.floor((minX - this.volumeOriginX) / this.profile.cellSize);
		const minCellY = Math.floor((minY - this.volumeOriginY) / this.profile.cellSize);
		const minCellZ = Math.floor((minZ - this.volumeOriginZ) / this.profile.cellSize);
		const maxCellX = Math.floor((maxX - this.volumeOriginX) / this.profile.cellSize);
		const maxCellY = Math.floor((maxY - this.volumeOriginY) / this.profile.cellSize);
		const maxCellZ = Math.floor((maxZ - this.volumeOriginZ) / this.profile.cellSize);

		for (let z = minCellZ; z <= maxCellZ; z += 1) {
			for (let y = minCellY; y <= maxCellY; y += 1) {
				for (let x = minCellX; x <= maxCellX; x += 1) {
					if (!this.isCellInBounds(x, y, z)) {
						continue;
					}

					this.markDirtyIndex(this.getLinearIndex(x, y, z));
				}
			}
		}
	}

	private markDirtyIndex(index: number): void {
		if (this.dirtyFlags[index] !== 0) {
			return;
		}

		this.dirtyFlags[index] = 1;
		this.dirtyQueue.push(index);
	}

	private clearDirtyState(): void {
		this.dirtyFlags.fill(0);
		this.dirtyQueue.length = 0;
	}

	private isCellInBounds(x: number, y: number, z: number): boolean {
		return (
			x >= 0 &&
			x < GI_VOLUME_WIDTH &&
			y >= 0 &&
			y < GI_VOLUME_HEIGHT &&
			z >= 0 &&
			z < GI_VOLUME_DEPTH
		);
	}

	private getLinearIndex(x: number, y: number, z: number): number {
		return x + y * GI_VOLUME_WIDTH + z * GI_VOLUME_WIDTH * GI_VOLUME_HEIGHT;
	}

	private getCellCoords(index: number): { x: number; y: number; z: number } {
		const z = Math.floor(index / (GI_VOLUME_WIDTH * GI_VOLUME_HEIGHT));
		const indexWithinSlice = index - z * GI_VOLUME_WIDTH * GI_VOLUME_HEIGHT;
		const y = Math.floor(indexWithinSlice / GI_VOLUME_WIDTH);
		const x = indexWithinSlice - y * GI_VOLUME_WIDTH;

		return { x, y, z };
	}

	private getAtlasOffset(x: number, y: number, z: number): number {
		return (x + z * GI_VOLUME_WIDTH + y * GI_VOLUME_WIDTH * GI_VOLUME_DEPTH) * 4;
	}
}

function computeCenteredVolumeOrigin(
	cameraVoxel: number,
	volumeSize: number,
	cellSize: number
): number {
	return (Math.floor(cameraVoxel / cellSize) - Math.floor(volumeSize * 0.5)) * cellSize;
}

function parseChunkKey(chunkKey: ChunkKey): [number, number, number] {
	const [x, y, z] = chunkKey.split(',').map((value) => Number.parseInt(value, 10));
	return [x || 0, y || 0, z || 0];
}

function colorToTuple(color: THREE.Color): [number, number, number] {
	return [color.r, color.g, color.b];
}

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
	return [vector.x, vector.y, vector.z];
}

function mix(a: number, b: number, amount: number): number {
	return a * (1 - amount) + b * amount;
}

function smoothstep(min: number, max: number, value: number): number {
	const t = clamp01((value - min) / Math.max(max - min, 1e-5));
	return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
