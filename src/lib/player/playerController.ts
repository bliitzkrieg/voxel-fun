import * as THREE from 'three';

import { InputState } from '$lib/engine/input';
import {
	getPlayerBounds,
	resolvePlayerMovement,
	type PlayerCollider
} from '$lib/player/playerPhysics';
import type { WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const LOOK_SENSITIVITY = 0.0025;
const WALK_SPEED = 14.2805;
const SPRINT_SPEED = 20.32225;
const JUMP_VELOCITY = 18.5;
const GRAVITY = 40;

const PLAYER_WIDTH = 2.5;
const PLAYER_HEIGHT = 7;
const PLAYER_EYE_HEIGHT = 6.2;

export class PlayerController {
	position = new THREE.Vector3();
	velocity = new THREE.Vector3();
	yaw = 0;
	pitch = 0;
	onGround = false;

	readonly width = PLAYER_WIDTH;
	readonly height = PLAYER_HEIGHT;
	readonly eyeHeight = PLAYER_EYE_HEIGHT;
	readonly collider: PlayerCollider = {
		halfWidth: this.width * 0.5,
		height: this.height
	};

	private readonly moveVector = new THREE.Vector3();
	private readonly forwardVector = new THREE.Vector3();
	private readonly rightVector = new THREE.Vector3();
	private readonly boundsMin = new THREE.Vector3();
	private readonly boundsMax = new THREE.Vector3();

	constructor(
		private readonly world: VoxelWorld,
		private readonly camera: THREE.PerspectiveCamera,
		private readonly input: InputState
	) {
		this.camera.rotation.order = 'YXZ';
		this.syncCamera();
	}

	teleport(x: number, y: number, z: number): void {
		this.position.set(x, y, z);
		this.velocity.set(0, 0, 0);
		this.syncCamera();
	}

	setLookAngles(yaw: number, pitch: number): void {
		this.yaw = yaw;
		this.pitch = THREE.MathUtils.clamp(pitch, -Math.PI * 0.5 + 0.01, Math.PI * 0.5 - 0.01);
		this.syncCamera();
	}

	update(dt: number): void {
		const mouseDelta = this.input.consumeMouseDelta();

		if (this.input.isPointerLocked()) {
			this.yaw -= mouseDelta.dx * LOOK_SENSITIVITY;
			this.pitch = THREE.MathUtils.clamp(
				this.pitch - mouseDelta.dy * LOOK_SENSITIVITY,
				-Math.PI * 0.5 + 0.01,
				Math.PI * 0.5 - 0.01
			);
		}

		this.moveVector.set(
			(this.input.isKeyDown('KeyD') ? 1 : 0) - (this.input.isKeyDown('KeyA') ? 1 : 0),
			0,
			(this.input.isKeyDown('KeyW') ? 1 : 0) - (this.input.isKeyDown('KeyS') ? 1 : 0)
		);

		if (this.moveVector.lengthSq() > 0) {
			this.moveVector.normalize();
			this.forwardVector.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
			this.rightVector.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

			const moveX =
				this.rightVector.x * this.moveVector.x + this.forwardVector.x * this.moveVector.z;
			const moveZ =
				this.rightVector.z * this.moveVector.x + this.forwardVector.z * this.moveVector.z;
			const moveLength = Math.hypot(moveX, moveZ) || 1;
			const moveSpeed =
				this.input.isKeyDown('ShiftLeft') || this.input.isKeyDown('ShiftRight')
					? SPRINT_SPEED
					: WALK_SPEED;

			this.velocity.x = (moveX / moveLength) * moveSpeed;
			this.velocity.z = (moveZ / moveLength) * moveSpeed;
		} else {
			this.velocity.x = 0;
			this.velocity.z = 0;
		}

		if (this.onGround && this.input.consumeKeyPress('Space')) {
			this.velocity.y = JUMP_VELOCITY;
			this.onGround = false;
		}

		this.velocity.y -= GRAVITY * dt;

		const movement = resolvePlayerMovement(
			this.world,
			this.position,
			this.velocity,
			this.collider,
			dt
		);
		this.position.copy(movement.position);
		this.velocity.copy(movement.velocity);
		this.onGround = movement.onGround;

		this.syncCamera();
	}

	canPlaceVoxelAt(targetX: number, targetY: number, targetZ: number): boolean {
		getPlayerBounds(this.position, this.collider, this.boundsMin, this.boundsMax);

		return !(
			targetX < this.boundsMax.x &&
			targetX + 1 > this.boundsMin.x &&
			targetY < this.boundsMax.y &&
			targetY + 1 > this.boundsMin.y &&
			targetZ < this.boundsMax.z &&
			targetZ + 1 > this.boundsMin.z
		);
	}

	intersectsVoxel(voxel: WorldCoord): boolean {
		return !this.canPlaceVoxelAt(voxel.x, voxel.y, voxel.z);
	}

	private syncCamera(): void {
		this.camera.rotation.order = 'YXZ';
		this.camera.rotation.y = this.yaw;
		this.camera.rotation.x = this.pitch;
		this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
		this.camera.updateMatrixWorld();
	}
}
