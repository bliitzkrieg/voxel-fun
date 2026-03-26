import * as THREE from 'three';

import { InputState } from '$lib/engine/input';
import {
	getPlayerBounds,
	intersectsSolid,
	resolvePlayerMovement,
	type PlayerCollider
} from '$lib/player/playerPhysics';
import { DEFAULT_VOXEL_SIZE, VOXEL_WORLD_SIZE } from '$lib/voxel/constants';
import type { WorldCoord } from '$lib/voxel/voxelTypes';
import type { VoxelWorld } from '$lib/voxel/world';

const LOOK_SENSITIVITY = 0.0025;
const WALK_SPEED = 14.2805 * DEFAULT_VOXEL_SIZE;
const SPRINT_SPEED = 20.32225 * DEFAULT_VOXEL_SIZE;
const CROUCH_SPEED = 8.925 * DEFAULT_VOXEL_SIZE;
const FLY_SPEED = 18.5 * DEFAULT_VOXEL_SIZE;
const FLY_BOOST_SPEED = 29 * DEFAULT_VOXEL_SIZE;
const AIR_SPEED_FACTOR = 0.92;
const GROUND_ACCELERATION = 110 * DEFAULT_VOXEL_SIZE;
const GROUND_DECELERATION = 96 * DEFAULT_VOXEL_SIZE;
const AIR_ACCELERATION = 42 * DEFAULT_VOXEL_SIZE;
const AIR_DECELERATION = 18 * DEFAULT_VOXEL_SIZE;
const FLY_ACCELERATION = 120 * DEFAULT_VOXEL_SIZE;
const FLY_DECELERATION = 110 * DEFAULT_VOXEL_SIZE;
const JUMP_VELOCITY = 18.5 * DEFAULT_VOXEL_SIZE;
const GRAVITY = 40 * DEFAULT_VOXEL_SIZE;
const FALL_GRAVITY_MULTIPLIER = 1.18;
const JUMP_CUT_GRAVITY_MULTIPLIER = 1.45;
const COYOTE_TIME_SECONDS = 0.12;
const JUMP_BUFFER_SECONDS = 0.12;

const PLAYER_WIDTH = 2.5 * DEFAULT_VOXEL_SIZE;
const PLAYER_STANDING_HEIGHT = 7 * DEFAULT_VOXEL_SIZE;
const PLAYER_CROUCH_HEIGHT = 4.75 * DEFAULT_VOXEL_SIZE;
const PLAYER_STANDING_EYE_HEIGHT = 6.2 * DEFAULT_VOXEL_SIZE;
const PLAYER_CROUCH_EYE_HEIGHT = 4.05 * DEFAULT_VOXEL_SIZE;
const CROUCH_TRANSITION_SPEED = 14;

export class PlayerController {
	position = new THREE.Vector3();
	velocity = new THREE.Vector3();
	yaw = 0;
	pitch = 0;
	onGround = false;
	isCrouching = false;
	isFlying = false;

	readonly width = PLAYER_WIDTH;
	readonly standingHeight = PLAYER_STANDING_HEIGHT;
	readonly crouchHeight = PLAYER_CROUCH_HEIGHT;
	readonly standingEyeHeight = PLAYER_STANDING_EYE_HEIGHT;
	readonly crouchEyeHeight = PLAYER_CROUCH_EYE_HEIGHT;
	eyeHeight = PLAYER_STANDING_EYE_HEIGHT;
	readonly collider: PlayerCollider = {
		halfWidth: this.width * 0.5,
		height: this.standingHeight
	};

	private readonly moveVector = new THREE.Vector3();
	private readonly forwardVector = new THREE.Vector3();
	private readonly rightVector = new THREE.Vector3();
	private readonly flyDirection = new THREE.Vector3();
	private readonly boundsMin = new THREE.Vector3();
	private readonly boundsMax = new THREE.Vector3();
	private readonly occupancyCheckCollider: PlayerCollider = {
		halfWidth: this.width * 0.5,
		height: this.standingHeight
	};
	private coyoteTimer = 0;
	private jumpBufferTimer = 0;
	private crouchToggleActive = false;

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

		if (this.input.canApplyMouseLook()) {
			this.yaw -= mouseDelta.dx * LOOK_SENSITIVITY;
			this.pitch = THREE.MathUtils.clamp(
				this.pitch - mouseDelta.dy * LOOK_SENSITIVITY,
				-Math.PI * 0.5 + 0.01,
				Math.PI * 0.5 - 0.01
			);
		}

		if (this.input.consumeKeyPress('KeyG')) {
			this.isFlying = !this.isFlying;
			this.velocity.set(0, 0, 0);

			if (this.isFlying) {
				this.crouchToggleActive = false;
				this.isCrouching = false;
				this.collider.height = this.standingHeight;
				this.eyeHeight = this.standingEyeHeight;
				this.onGround = false;
			}
		}

		this.updateCrouchState(dt);

		this.moveVector.set(
			(this.input.isKeyDown('KeyD') ? 1 : 0) - (this.input.isKeyDown('KeyA') ? 1 : 0),
			0,
			(this.input.isKeyDown('KeyW') ? 1 : 0) - (this.input.isKeyDown('KeyS') ? 1 : 0)
		);

		if (this.isFlying) {
			this.updateFlyMovement(dt);
			this.syncCamera();
			return;
		}

		this.coyoteTimer = this.onGround ? COYOTE_TIME_SECONDS : Math.max(0, this.coyoteTimer - dt);
		this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

		if (this.input.consumeKeyPress('Space')) {
			this.jumpBufferTimer = JUMP_BUFFER_SECONDS;
		}

		if (this.moveVector.lengthSq() > 0) {
			this.moveVector.normalize();
			this.forwardVector.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
			this.rightVector.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

			const moveX =
				this.rightVector.x * this.moveVector.x + this.forwardVector.x * this.moveVector.z;
			const moveZ =
				this.rightVector.z * this.moveVector.x + this.forwardVector.z * this.moveVector.z;
			const moveLength = Math.hypot(moveX, moveZ) || 1;
			const moveSpeed = this.isCrouching
				? CROUCH_SPEED
				: this.input.isShiftDown()
					? SPRINT_SPEED
					: WALK_SPEED;
			const targetSpeed = this.onGround ? moveSpeed : moveSpeed * AIR_SPEED_FACTOR;
			const acceleration = this.onGround ? GROUND_ACCELERATION : AIR_ACCELERATION;

			this.velocity.x = moveToward(
				this.velocity.x,
				(moveX / moveLength) * targetSpeed,
				acceleration * dt
			);
			this.velocity.z = moveToward(
				this.velocity.z,
				(moveZ / moveLength) * targetSpeed,
				acceleration * dt
			);
		} else {
			const deceleration = this.onGround ? GROUND_DECELERATION : AIR_DECELERATION;
			this.velocity.x = moveToward(this.velocity.x, 0, deceleration * dt);
			this.velocity.z = moveToward(this.velocity.z, 0, deceleration * dt);
		}

		if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
			this.velocity.y = JUMP_VELOCITY;
			this.onGround = false;
			this.coyoteTimer = 0;
			this.jumpBufferTimer = 0;
		}

		const gravityMultiplier =
			this.velocity.y < 0
				? FALL_GRAVITY_MULTIPLIER
				: this.velocity.y > 0 && !this.input.isKeyDown('Space')
					? JUMP_CUT_GRAVITY_MULTIPLIER
					: 1;

		this.velocity.y -= GRAVITY * gravityMultiplier * dt;

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

		if (this.onGround && this.velocity.y <= 0) {
			this.velocity.y = 0;
		}

		this.syncCamera();
	}

	canPlaceVoxelAt(targetX: number, targetY: number, targetZ: number): boolean {
		return this.canPlaceBlockAt({ x: targetX, y: targetY, z: targetZ }, 1);
	}

	getPlacementStateSignature(): string {
		return `${this.position.x.toFixed(2)},${this.position.y.toFixed(2)},${this.position.z.toFixed(2)},${this.collider.height.toFixed(2)}`;
	}

	canPlaceBlockAt(origin: WorldCoord, size: number): boolean {
		getPlayerBounds(this.position, this.collider, this.boundsMin, this.boundsMax);

		return !(
			origin.x < this.boundsMax.x &&
			origin.x + size > this.boundsMin.x &&
			origin.y < this.boundsMax.y &&
			origin.y + size > this.boundsMin.y &&
			origin.z < this.boundsMax.z &&
			origin.z + size > this.boundsMin.z
		);
	}

	intersectsVoxel(voxel: WorldCoord): boolean {
		return !this.canPlaceVoxelAt(voxel.x, voxel.y, voxel.z);
	}

	private syncCamera(): void {
		this.camera.rotation.order = 'YXZ';
		this.camera.rotation.y = this.yaw;
		this.camera.rotation.x = this.pitch;
		this.camera.position.set(
			this.position.x * VOXEL_WORLD_SIZE,
			(this.position.y + this.eyeHeight) * VOXEL_WORLD_SIZE,
			this.position.z * VOXEL_WORLD_SIZE
		);
		this.camera.updateMatrixWorld();
	}

	private updateCrouchState(dt: number): void {
		if (this.isFlying) {
			this.input.consumeControlTap();
			this.isCrouching = false;
			this.collider.height = this.standingHeight;
			this.eyeHeight = THREE.MathUtils.lerp(
				this.eyeHeight,
				this.standingEyeHeight,
				1 - Math.exp(-CROUCH_TRANSITION_SPEED * dt)
			);
			return;
		}

		if (this.input.consumeControlTap()) {
			this.crouchToggleActive = !this.crouchToggleActive;
		}

		const shouldCrouch = this.crouchToggleActive || !this.canOccupyHeight(this.standingHeight);
		const targetHeight = shouldCrouch ? this.crouchHeight : this.standingHeight;
		const targetEyeHeight = shouldCrouch ? this.crouchEyeHeight : this.standingEyeHeight;
		const transitionAlpha = 1 - Math.exp(-CROUCH_TRANSITION_SPEED * dt);

		this.isCrouching = shouldCrouch;
		this.collider.height = targetHeight;
		this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, targetEyeHeight, transitionAlpha);
	}

	private canOccupyHeight(height: number): boolean {
		this.occupancyCheckCollider.height = height;
		getPlayerBounds(this.position, this.occupancyCheckCollider, this.boundsMin, this.boundsMax);
		return !intersectsSolid(this.world, this.boundsMin, this.boundsMax);
	}

	private updateFlyMovement(dt: number): void {
		this.forwardVector.set(
			-Math.sin(this.yaw) * Math.cos(this.pitch),
			Math.sin(this.pitch),
			-Math.cos(this.yaw) * Math.cos(this.pitch)
		);
		this.rightVector.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
		this.flyDirection.set(0, 0, 0);
		this.flyDirection.addScaledVector(this.rightVector, this.moveVector.x);
		this.flyDirection.addScaledVector(this.forwardVector, this.moveVector.z);
		this.flyDirection.y +=
			(this.input.isKeyDown('Space') ? 1 : 0) -
			(this.input.isKeyDown('ControlLeft') || this.input.isKeyDown('ControlRight') ? 1 : 0);

		if (this.flyDirection.lengthSq() > 0) {
			this.flyDirection.normalize();
			const flySpeed = this.input.isShiftDown() ? FLY_BOOST_SPEED : FLY_SPEED;
			this.velocity.x = moveToward(
				this.velocity.x,
				this.flyDirection.x * flySpeed,
				FLY_ACCELERATION * dt
			);
			this.velocity.y = moveToward(
				this.velocity.y,
				this.flyDirection.y * flySpeed,
				FLY_ACCELERATION * dt
			);
			this.velocity.z = moveToward(
				this.velocity.z,
				this.flyDirection.z * flySpeed,
				FLY_ACCELERATION * dt
			);
		} else {
			this.velocity.x = moveToward(this.velocity.x, 0, FLY_DECELERATION * dt);
			this.velocity.y = moveToward(this.velocity.y, 0, FLY_DECELERATION * dt);
			this.velocity.z = moveToward(this.velocity.z, 0, FLY_DECELERATION * dt);
		}

		this.position.addScaledVector(this.velocity, dt);
		this.onGround = false;
	}
}

function moveToward(current: number, target: number, maxDelta: number): number {
	if (current < target) {
		return Math.min(current + maxDelta, target);
	}

	if (current > target) {
		return Math.max(current - maxDelta, target);
	}

	return target;
}
